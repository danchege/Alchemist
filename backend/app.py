"""
Flask Application for Alchemist - Data Cleaning and Transformation Tool

This is the main Flask application that provides REST API endpoints for
data upload, cleaning, transformation, visualization, and export operations.
"""

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import sys
import json
import io
from datetime import datetime
import traceback

# Add modules to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from modules.data_handler import DataHandler
from modules.visualization import Visualizer
from modules.stats import StatisticsCalculator
from utils.helpers import (
    get_file_type, validate_file_size, validate_dataframe_structure,
    sanitize_column_names, create_data_preview, create_operation_log,
    save_session_data, load_session_data, generate_unique_id,
    export_to_format
)

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
app.config['SESSION_FOLDER'] = os.path.join(app.config['UPLOAD_FOLDER'], 'sessions')

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['SESSION_FOLDER'], exist_ok=True)

# Global instances
data_handler = DataHandler()
visualizer = Visualizer()
stats_calculator = StatisticsCalculator()

# Session management
sessions = {}


@app.route('/')
def index():
    """Serve the frontend index page"""
    return send_from_directory('../frontend', 'index.html')


@app.route('/<path:filename>')
def static_files(filename):
    """Serve static frontend files"""
    return send_from_directory('../frontend', filename)


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """
    Upload and process a data file
    
    Expected form data:
    - file: The data file (CSV, Excel, JSON)
    - session_id: Optional session identifier
    """
    try:
        # Reset all handler states at the start of each upload
        try:
            data_handler.data = None
            data_handler.original_data = None
            visualizer.set_data(None)
            stats_calculator.set_data(None)
        except Exception as reset_error:
            # Log but don't fail on reset errors
            print(f"Warning: Error resetting state: {reset_error}")
        
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # Get session ID or create new one
        session_id = request.form.get('session_id', generate_unique_id())
        
        # Read file content
        file_content = file.read()
        filename = file.filename
        
        # Validate file
        file_type = get_file_type(file_content, filename)
        if file_type == 'unknown':
            return jsonify({'success': False, 'error': 'Unsupported file type'}), 400
        
        size_validation = validate_file_size(file_content)
        if not size_validation['valid']:
            return jsonify({'success': False, 'error': size_validation['message']}), 400
        
        # Load data
        print(f"Loading data: file_type={file_type}, size={len(file_content)} bytes")
        load_result = data_handler.load_data(file_content, file_type)
        print(f"Data loaded: success={load_result.get('success', False)}")
        
        if not load_result['success']:
            # Reset state on load failure
            data_handler.data = None
            data_handler.original_data = None
            visualizer.set_data(None)
            stats_calculator.set_data(None)
            return jsonify(load_result), 400
        
        # Ensure data was loaded successfully
        if data_handler.data is None:
            # Reset state if data is None
            data_handler.data = None
            data_handler.original_data = None
            visualizer.set_data(None)
            stats_calculator.set_data(None)
            return jsonify({
                'success': False,
                'error': 'Data loaded but DataFrame is None'
            }), 400
        
        # Validate DataFrame structure
        print(f"Validating DataFrame: shape={data_handler.data.shape}")
        validation_result = validate_dataframe_structure(data_handler.data)
        print(f"Validation result: valid={validation_result.get('valid', False)}")
        if not validation_result['valid']:
            # Reset state on validation failure
            data_handler.data = None
            data_handler.original_data = None
            visualizer.set_data(None)
            stats_calculator.set_data(None)
            return jsonify(validation_result), 400
        
        # Sanitize column names
        data_handler.data = sanitize_column_names(data_handler.data)
        
        # Double-check data is still valid after sanitization
        if data_handler.data is None:
            data_handler.data = None
            data_handler.original_data = None
            visualizer.set_data(None)
            stats_calculator.set_data(None)
            return jsonify({
                'success': False,
                'error': 'Data became None after sanitization'
            }), 400
        
        # Update visualizer and stats calculator
        visualizer.set_data(data_handler.data)
        stats_calculator.set_data(data_handler.data)
        
        # Create preview
        print("Creating data preview...")
        preview_result = create_data_preview(data_handler.data)
        print(f"Preview created: success={preview_result.get('success', True)}")
        
        # Check if preview creation failed
        if not preview_result.get('success', True):
            return jsonify({
                'success': False,
                'error': preview_result.get('error', 'Failed to create preview')
            }), 400
        
        # Save session
        print("Saving session data...")
        session_data = {
            'session_id': session_id,
            'filename': filename,
            'file_type': file_type,
            'upload_time': datetime.now().isoformat(),
            'data_info': load_result,
            'validation': validation_result
        }
        sessions[session_id] = session_data
        save_session_data(session_id, session_data, app.config['SESSION_FOLDER'])
        print("Session saved")
        
        # Log operation
        operation_log = create_operation_log('upload', {
            'filename': filename,
            'file_type': file_type,
            'file_size_mb': size_validation['file_size_mb']
        })
        
        print("Returning success response")
        return jsonify({
            'success': True,
            'session_id': session_id,
            'data_info': load_result,
            'preview': preview_result,
            'validation': validation_result,
            'operation_log': operation_log
        })
        
    except Exception as e:
        # Reset state on any exception
        try:
            data_handler.data = None
            data_handler.original_data = None
            visualizer.set_data(None)
            stats_calculator.set_data(None)
        except:
            pass  # Ignore errors during cleanup
        
        # Get error details safely
        error_msg = str(e)
        try:
            tb = traceback.format_exc()
            # Print to console for debugging
            print(f"ERROR in upload_file: {error_msg}")
            print(f"Traceback:\n{tb}")
        except:
            tb = 'Unable to get traceback'
        
        return jsonify({
            'success': False,
            'error': f'Upload failed: {error_msg}',
            'traceback': tb
        }), 500


@app.route('/api/clean', methods=['POST'])
def clean_data():
    """
    Perform data cleaning operations
    
    Expected JSON payload:
    {
        "operations": [
            {
                "type": "remove_duplicates",
                ...
            },
            {
                "type": "fill_missing",
                "column": "column_name",
                "method": "mean",
                ...
            }
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'operations' not in data:
            return jsonify({'success': False, 'error': 'No operations provided'}), 400
        
        operations = data['operations']
        session_id = data.get('session_id')
        
        # Save state before performing operations for undo functionality
        operation_desc = f"Clean operations: {', '.join([op.get('type', 'unknown') for op in operations])}"
        data_handler.save_state(operation_desc)
        
        # Perform cleaning
        clean_result = data_handler.clean_data(operations)
        
        if clean_result['success']:
            # Update visualizer and stats calculator
            visualizer.set_data(data_handler.data)
            stats_calculator.set_data(data_handler.data)
            
            # Update session
            if session_id and session_id in sessions:
                sessions[session_id]['last_cleaned'] = datetime.now().isoformat()
                sessions[session_id]['cleaning_results'] = clean_result['results']
                save_session_data(session_id, sessions[session_id], app.config['SESSION_FOLDER'])
            
            # Log operation
            operation_log = create_operation_log('clean', {'operations': operations})
            clean_result['operation_log'] = operation_log
        
        return jsonify(clean_result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Cleaning failed: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/filter', methods=['POST'])
def filter_data():
    """
    Apply filters to the data
    
    Expected JSON payload:
    {
        "filters": [
            {
                "column": "column_name",
                "operator": "equals|greater_than|contains|...",
                "value": "filter_value"
            }
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'filters' not in data:
            return jsonify({'success': False, 'error': 'No filters provided'}), 400
        
        filters = data['filters']
        
        # Apply filters
        filter_result = data_handler.filter_data(filters)
        
        return jsonify(filter_result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Filtering failed: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/transform', methods=['POST'])
def transform_data():
    """
    Apply data transformations
    
    Expected JSON payload:
    {
        "transformations": [
            {
                "type": "create_column|rename_column|drop_column|...",
                "parameters": {...}
            }
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'transformations' not in data:
            return jsonify({'success': False, 'error': 'No transformations provided'}), 400
        
        transformations = data['transformations']
        session_id = data.get('session_id')
        
        # Apply transformations
        transform_result = data_handler.transform_data(transformations)
        
        if transform_result['success']:
            # Update visualizer and stats calculator
            visualizer.set_data(data_handler.data)
            stats_calculator.set_data(data_handler.data)
            
            # Update session
            if session_id and session_id in sessions:
                sessions[session_id]['last_transformed'] = datetime.now().isoformat()
                save_session_data(session_id, sessions[session_id], app.config['SESSION_FOLDER'])
            
            # Log operation
            operation_log = create_operation_log('transform', {'transformations': transformations})
            transform_result['operation_log'] = operation_log
        
        return jsonify(transform_result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Transformation failed: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/visualize', methods=['POST'])
def create_visualization():
    """
    Create data visualizations
    
    Expected JSON payload:
    {
        "plot_type": "histogram|scatter|bar|box|heatmap|line|pie",
        "parameters": {
            "column": "column_name",
            "x_column": "x_column_name",
            "y_column": "y_column_name",
            ...
        }
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'plot_type' not in data:
            return jsonify({'success': False, 'error': 'No plot type provided'}), 400
        
        plot_type = data['plot_type']
        parameters = data.get('parameters', {})
        
        # Create visualization based on type
        if plot_type == 'histogram':
            result = visualizer.create_histogram(
                parameters.get('column'),
                parameters.get('bins', 30),
                parameters.get('title')
            )
        elif plot_type == 'scatter':
            result = visualizer.create_scatter_plot(
                parameters.get('x_column'),
                parameters.get('y_column'),
                parameters.get('color_column'),
                parameters.get('size_column'),
                parameters.get('title')
            )
        elif plot_type == 'bar':
            result = visualizer.create_bar_chart(
                parameters.get('column'),
                parameters.get('title'),
                parameters.get('top_n')
            )
        elif plot_type == 'box':
            result = visualizer.create_box_plot(
                parameters.get('column'),
                parameters.get('group_by'),
                parameters.get('title')
            )
        elif plot_type == 'heatmap':
            result = visualizer.create_heatmap(
                parameters.get('columns'),
                parameters.get('title')
            )
        elif plot_type == 'line':
            result = visualizer.create_line_plot(
                parameters.get('x_column'),
                parameters.get('y_columns', []),
                parameters.get('title')
            )
        elif plot_type == 'pie':
            result = visualizer.create_pie_chart(
                parameters.get('column'),
                parameters.get('title'),
                parameters.get('top_n', 10)
            )
        else:
            return jsonify({'success': False, 'error': f'Unsupported plot type: {plot_type}'}), 400
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Visualization failed: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/stats', methods=['GET'])
def get_statistics():
    """
    Get descriptive statistics for the data
    
    Query parameters:
    - type: 'descriptive'|'categorical'|'correlation'|'quality'
    - columns: Comma-separated list of columns (optional)
    """
    try:
        stats_type = request.args.get('type', 'descriptive')
        columns_param = request.args.get('columns')
        
        columns = columns_param.split(',') if columns_param else None
        
        if stats_type == 'descriptive':
            result = stats_calculator.descriptive_statistics(columns)
        elif stats_type == 'categorical':
            result = stats_calculator.categorical_statistics(columns)
        elif stats_type == 'correlation':
            method = request.args.get('method', 'pearson')
            result = stats_calculator.correlation_analysis(columns, method)
        elif stats_type == 'quality':
            result = stats_calculator.data_quality_report()
        elif stats_type == 'outliers':
            method = request.args.get('method', 'iqr')
            result = stats_calculator.outlier_detection(columns, method)
        else:
            return jsonify({'success': False, 'error': f'Unknown statistics type: {stats_type}'}), 400
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Statistics calculation failed: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/data/info', methods=['GET'])
def get_data_info():
    """Get current data information"""
    try:
        info = data_handler.get_data_info()
        return jsonify(info)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to get data info: {str(e)}'
        }), 500


@app.route('/api/download', methods=['POST'])
def download_data():
    """
    Download processed data in specified format
    
    Expected JSON payload:
    {
        "format": "csv|excel|json",
        "filename": "optional_filename"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'format' not in data:
            return jsonify({'success': False, 'error': 'No format specified'}), 400
        
        format_type = data['format']
        filename = data.get('filename')
        
        # Check if data is available
        if data_handler.data is None:
            return jsonify({
                'success': False,
                'error': 'No data available to download. Please upload a file first.'
            }), 400
        
        # Export data
        export_result = data_handler.export_data(format_type, filename)
        
        if not export_result['success']:
            return jsonify(export_result), 400
        
        # Return file for download
        try:
            if format_type == 'excel':
                file_obj = io.BytesIO(export_result['data'])
                mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            elif format_type == 'json':
                file_obj = io.BytesIO(export_result['data'].encode('utf-8'))
                mimetype = 'application/json'
            else:  # CSV
                file_obj = io.BytesIO(export_result['data'].encode('utf-8'))
                mimetype = 'text/csv'
            
            file_obj.seek(0)  # Ensure we're at the start of the file
            
            file_size = len(export_result['data']) if isinstance(export_result['data'], (str, bytes)) else len(file_obj.getvalue())
            print(f"Downloading file: {export_result['filename']}, size: {file_size} bytes, format: {format_type}")
            
            response = send_file(
                file_obj,
                as_attachment=True,
                download_name=export_result['filename'],
                mimetype=mimetype
            )
            
            # Add CORS headers for file download
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
            
            return response
        except Exception as file_error:
            print(f"Error creating file object: {file_error}")
            raise
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Download failed: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/session/<session_id>', methods=['GET'])
def get_session(session_id):
    """Get session information"""
    try:
        session_data = load_session_data(session_id, app.config['SESSION_FOLDER'])
        if session_data:
            return jsonify({'success': True, 'session': session_data})
        else:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to get session: {str(e)}'
        }), 500


@app.route('/api/plots/available', methods=['GET'])
def get_available_plots():
    """Get available plot types based on current data"""
    try:
        result = visualizer.get_available_plots()
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to get available plots: {str(e)}'
        }), 500


@app.route('/api/preview', methods=['POST'])
def preview_operations():
    """
    Preview data cleaning operations before applying them
    
    Expected JSON payload:
    {
        "operations": [...],
        "sample_size": 100  // optional
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'operations' not in data:
            return jsonify({'success': False, 'error': 'No operations provided'}), 400
        
        operations = data['operations']
        sample_size = data.get('sample_size', 100)
        source_data = data.get('data')  # Optional: filtered data from frontend
        
        # Preview operations (use source_data if provided, e.g. when filter is active)
        preview_result = data_handler.preview_operations(operations, sample_size, source_data=source_data)
        
        return jsonify(preview_result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/undo', methods=['POST'])
def undo_operation():
    """
    Undo the last data operation
    
    Expected JSON payload:
    {}  // no payload required
    """
    try:
        undo_result = data_handler.undo()
        
        if undo_result['success']:
            # Update visualizer and stats calculator
            visualizer.set_data(data_handler.data)
            stats_calculator.set_data(data_handler.data)
        
        return jsonify(undo_result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/redo', methods=['POST'])
def redo_operation():
    """
    Redo the last undone operation
    
    Expected JSON payload:
    {}  // no payload required
    """
    try:
        redo_result = data_handler.redo()
        
        if redo_result['success']:
            # Update visualizer and stats calculator
            visualizer.set_data(data_handler.data)
            stats_calculator.set_data(data_handler.data)
        
        return jsonify(redo_result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/history', methods=['GET'])
def get_operation_history():
    """
    Get the operation history
    
    Returns:
        JSON with operation history and undo/redo availability
    """
    try:
        history_result = data_handler.get_operation_history()
        return jsonify(history_result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/reset', methods=['POST'])
def reset_data():
    """Reset the dataset back to the originally loaded data."""
    try:
        data = request.get_json(silent=True) or {}
        session_id = data.get('session_id')

        reset_result = data_handler.reset()

        if reset_result.get('success'):
            visualizer.set_data(data_handler.data)
            stats_calculator.set_data(data_handler.data)

            if session_id and session_id in sessions:
                sessions[session_id]['last_reset'] = datetime.now().isoformat()
                save_session_data(session_id, sessions[session_id], app.config['SESSION_FOLDER'])

            operation_log = create_operation_log('reset', {})
            reset_result['operation_log'] = operation_log

        return jsonify(reset_result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({'success': False, 'error': 'File too large'}), 413


@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(e):
    """Handle 500 errors"""
    return jsonify({'success': False, 'error': 'Internal server error'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("Starting Alchemist - Data Cleaning Tool")
    print(f"Upload folder: {app.config['UPLOAD_FOLDER']}")
    print(f"Session folder: {app.config['SESSION_FOLDER']}")
    print(f"Server running on http://0.0.0.0:{port}")
    app.run(debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true', host='0.0.0.0', port=port)
