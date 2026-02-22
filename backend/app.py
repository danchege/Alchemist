"""
Flask Application for Alchemist - Data Cleaning and Transformation Tool

This is the main Flask application that provides REST API endpoints for
data upload, cleaning, transformation, visualization, and export operations.
"""

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
import os
import sys
import json
import io
import sqlite3
import re
import threading
import webbrowser
from datetime import datetime
import traceback

def _count_csv_data_rows(file_path: str) -> int:
    count = 0
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            count += chunk.count(b'\n')
    return max(0, count - 1)

def _read_csv_page(file_path: str, page: int, page_size: int):
    page = max(1, page)
    page_size = max(1, page_size)
    chunk_index = page - 1
    reader = None
    try:
        reader = __import__('pandas').read_csv(file_path, chunksize=page_size)
        for idx, chunk in enumerate(reader):
            if idx == chunk_index:
                return chunk
        return None
    finally:
        try:
            if reader is not None:
                reader.close()
        except Exception:
            pass

def _import_csv_to_sqlite(csv_path: str, sqlite_path: str, table_name: str = 'data'):
    import pandas as pd

    if os.path.exists(sqlite_path):
        try:
            os.unlink(sqlite_path)
        except OSError:
            pass

    conn = sqlite3.connect(sqlite_path)
    try:
        chunk_size = 50000
        first = True
        for chunk in pd.read_csv(csv_path, chunksize=chunk_size):
            chunk = sanitize_column_names(chunk)
            chunk.to_sql(table_name, conn, if_exists='replace' if first else 'append', index=False)
            first = False
        conn.commit()
    finally:
        conn.close()

def _sqlite_list_columns(conn: sqlite3.Connection, table_name: str) -> list:
    cur = conn.execute(f'PRAGMA table_info("{table_name}")')
    return [row[1] for row in cur.fetchall()]

def _sqlite_fetch_dicts(conn: sqlite3.Connection, sql: str, params: tuple):
    conn.row_factory = sqlite3.Row
    cur = conn.execute(sql, params)
    rows = cur.fetchall()
    return [dict(r) for r in rows]


def _sqlite_ensure_index(conn: sqlite3.Connection, table_name: str, column: str):
    idx_name = f"idx_{table_name}_{column}".replace('"', '').replace("'", '')
    conn.execute(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON "{table_name}" ("{column}")')


def _fingerprint(value: str) -> str:
    if value is None:
        return ''
    s = str(value).strip().lower()
    if s == '':
        return ''
    s = re.sub(r'[^a-z0-9\s]+', ' ', s)
    tokens = [t for t in s.split() if t]
    tokens.sort()
    return ' '.join(tokens)

# Add modules to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from modules.data_handler import DataHandler
from modules.visualization import Visualizer
from modules.stats import StatisticsCalculator
from utils.helpers import (
    get_file_type, validate_file_size, validate_dataframe_structure,
    sanitize_column_names, create_data_preview, create_operation_log,
    save_session_data, load_session_data, generate_unique_id,
    export_to_format, export_to_mysql_sql, replace_nan_with_none
)

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# Configuration (restart server after changing; 512MB allows large CSVs)
app.config['MAX_CONTENT_LENGTH'] = 512 * 1024 * 1024  # 512MB max file size
app.config['LARGE_FILE_THRESHOLD_BYTES'] = 25 * 1024 * 1024

_IS_FROZEN = getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')

_RUNTIME_BASE_DIR = (
    os.path.dirname(sys.executable)
    if _IS_FROZEN
    else os.path.dirname(os.path.dirname(__file__))
)

_FRONTEND_DIR = (
    os.path.join(sys._MEIPASS, 'frontend')
    if _IS_FROZEN
    else os.path.join(_RUNTIME_BASE_DIR, 'frontend')
)

app.config['UPLOAD_FOLDER'] = os.path.join(_RUNTIME_BASE_DIR, 'data')
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

@app.errorhandler(RequestEntityTooLarge)
def handle_request_entity_too_large(e):
    """Return JSON when upload exceeds MAX_CONTENT_LENGTH (413)."""
    return jsonify({
        'success': False,
        'error': '413 Request Entity Too Large: The data value transmitted exceeds the capacity limit.',
        'detail': f'Maximum upload size is {app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)}MB.'
    }), 413

@app.route('/favicon.ico')
def favicon():
    """Avoid 404 for browser favicon requests."""
    return '', 204

@app.route('/')
def index():
    """Serve the frontend index page"""
    return send_from_directory(_FRONTEND_DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """Serve static frontend files"""
    if filename == 'favicon.ico':
        return '', 204
    return send_from_directory(_FRONTEND_DIR, filename)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'ok': True}), 200

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
        
        filename = file.filename

        # If file is large and CSV, store to disk and import to a per-session SQLite DB.
        # This avoids loading the full dataset into memory and enables server-side pagination/filter/sort.
        content_length = request.content_length or 0
        if content_length >= app.config['LARGE_FILE_THRESHOLD_BYTES'] and filename.lower().endswith('.csv'):
            upload_id = generate_unique_id()
            safe_name = os.path.basename(filename)
            stored_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{upload_id}__{safe_name}")
            file.stream.seek(0)
            file.save(stored_path)

            sqlite_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{upload_id}.db")
            table_name = 'data'
            _import_csv_to_sqlite(stored_path, sqlite_path, table_name=table_name)

            conn = sqlite3.connect(sqlite_path)
            try:
                columns = _sqlite_list_columns(conn, table_name)
                total_rows = conn.execute(f'SELECT COUNT(1) FROM "{table_name}"').fetchone()[0]
                preview_rows = _sqlite_fetch_dicts(
                    conn,
                    f'SELECT * FROM "{table_name}" LIMIT 100',
                    ()
                )
            finally:
                conn.close()

            preview_dict = replace_nan_with_none(preview_rows)
            dtypes_dict = {str(c): 'unknown' for c in columns}

            session_data = {
                'session_id': session_id,
                'filename': filename,
                'file_type': 'csv',
                'upload_time': datetime.now().isoformat(),
                'large_mode': True,
                'large_file': {
                    'path': stored_path,
                    'total_rows': total_rows,
                    'columns': columns,
                    'dtypes': dtypes_dict,
                    'engine': 'sqlite',
                    'sqlite_path': sqlite_path,
                    'sqlite_table': table_name
                }
            }
            sessions[session_id] = session_data
            save_session_data(session_id, session_data, app.config['SESSION_FOLDER'])

            operation_log = create_operation_log('upload', {
                'filename': filename,
                'file_type': 'csv',
                'large_mode': True
            })

            return jsonify({
                'success': True,
                'session_id': session_id,
                'data_info': {
                    'success': True,
                    'data': preview_dict,
                    'columns': columns,
                    'shape': [total_rows, len(columns)],
                    'dtypes': dtypes_dict,
                    'preview': preview_dict,
                    'note': 'Large file mode: data is paginated and operations are limited'
                },
                'preview': {
                    'success': True,
                    'data': preview_dict,
                    'columns': columns,
                    'shape': [total_rows, len(columns)]
                },
                'validation': {'valid': True, 'message': 'Large file mode'},
                'operation_log': operation_log,
                'large_mode': True,
                'pagination': {
                    'total_rows': total_rows
                }
            })

        # Read file content
        file_content = file.read()
        
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

        if session_id and session_id in sessions and sessions[session_id].get('large_mode'):
            lf = sessions[session_id].get('large_file', {})
            if lf.get('engine') != 'sqlite':
                return jsonify({
                    'success': False,
                    'error': 'Large mode engine not supported for cleaning.'
                }), 400

            sqlite_path = lf.get('sqlite_path')
            table_name = lf.get('sqlite_table')
            columns = lf.get('columns', [])
            if not sqlite_path or not table_name or not os.path.exists(sqlite_path):
                return jsonify({
                    'success': False,
                    'error': 'Large SQLite database not found on server.'
                }), 400

            if not columns:
                return jsonify({
                    'success': False,
                    'error': 'Large file metadata is missing columns.'
                }), 400

            results = []
            conn = sqlite3.connect(sqlite_path)
            try:
                for operation in operations:
                    op_type = operation.get('type')
                    if op_type == 'remove_duplicates':
                        before_count = conn.execute(f'SELECT COUNT(1) FROM "{table_name}"').fetchone()[0]
                        tmp_table = f"{table_name}__dedup_{generate_unique_id().replace('-', '')}"[:63]
                        conn.execute(f'CREATE TABLE "{tmp_table}" AS SELECT DISTINCT * FROM "{table_name}"')
                        conn.execute(f'DROP TABLE "{table_name}"')
                        conn.execute(f'ALTER TABLE "{tmp_table}" RENAME TO "{table_name}"')
                        after_count = conn.execute(f'SELECT COUNT(1) FROM "{table_name}"').fetchone()[0]
                        conn.commit()
                        results.append({
                            'operation': 'remove_duplicates',
                            'removed': int(before_count - after_count)
                        })

                    elif op_type == 'remove_empty':
                        target = operation.get('target', 'rows')
                        if target != 'rows':
                            return jsonify({
                                'success': False,
                                'error': 'Large mode supports remove_empty for rows only.'
                            }), 400

                        before_count = conn.execute(f'SELECT COUNT(1) FROM "{table_name}"').fetchone()[0]
                        # Remove rows where all columns are NULL or empty after trimming.
                        predicates = []
                        for c in columns:
                            predicates.append(f"(\"{c}\" IS NULL OR trim(CAST(\"{c}\" AS TEXT)) = '')")
                        where_all_empty = ' AND '.join(predicates) if predicates else '1=0'
                        conn.execute(f'DELETE FROM "{table_name}" WHERE {where_all_empty}')
                        after_count = conn.execute(f'SELECT COUNT(1) FROM "{table_name}"').fetchone()[0]
                        conn.commit()
                        results.append({
                            'operation': 'remove_empty',
                            'target': 'rows',
                            'removed': int(before_count - after_count)
                        })

                    elif op_type == 'clean_text':
                        cols = operation.get('columns', [])
                        text_ops = operation.get('text_operations', [])
                        case_type = (operation.get('case_type') or 'lower').lower()

                        for col in cols:
                            if col not in columns:
                                continue
                            if 'trim_whitespace' in text_ops:
                                conn.execute(
                                    f'UPDATE "{table_name}" SET "{col}" = trim(CAST("{col}" AS TEXT))'
                                )
                            if 'normalize_case' in text_ops:
                                if case_type == 'upper':
                                    conn.execute(
                                        f'UPDATE "{table_name}" SET "{col}" = upper(CAST("{col}" AS TEXT))'
                                    )
                                else:
                                    conn.execute(
                                        f'UPDATE "{table_name}" SET "{col}" = lower(CAST("{col}" AS TEXT))'
                                    )
                        conn.commit()
                        results.append({
                            'operation': 'clean_text',
                            'columns': cols,
                            'text_operations': text_ops,
                            'case_type': case_type
                        })

                    else:
                        return jsonify({
                            'success': False,
                            'error': f'Operation not supported in large mode: {op_type}'
                        }), 400

                total_rows = conn.execute(f'SELECT COUNT(1) FROM "{table_name}"').fetchone()[0]
                preview_rows = _sqlite_fetch_dicts(
                    conn,
                    f'SELECT * FROM "{table_name}" LIMIT 100',
                    ()
                )
            finally:
                conn.close()

            lf['total_rows'] = int(total_rows)
            sessions[session_id]['large_file'] = lf
            sessions[session_id]['last_cleaned'] = datetime.now().isoformat()
            save_session_data(session_id, sessions[session_id], app.config['SESSION_FOLDER'])

            operation_log = create_operation_log('clean', {
                'operations': operations,
                'large_mode': True
            })

            return jsonify({
                'success': True,
                'data': replace_nan_with_none(preview_rows),
                'shape': [int(total_rows), len(columns)],
                'results': results,
                'operation_log': operation_log,
                'note': 'Large file mode: returned data is a preview of the first 100 rows'
            })
        
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
        session_id = data.get('session_id')

        if session_id and session_id in sessions and sessions[session_id].get('large_mode'):
            return jsonify({
                'success': False,
                'error': 'Filtering is not available in large file mode yet.'
            }), 400
        
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
        session_id = request.args.get('session_id')
        if session_id and session_id in sessions and sessions[session_id].get('large_mode'):
            lf = sessions[session_id].get('large_file', {})
            return jsonify({
                'success': True,
                'large_mode': True,
                'filename': sessions[session_id].get('filename'),
                'columns': lf.get('columns', []),
                'shape': [lf.get('total_rows', 0), len(lf.get('columns', []))],
                'dtypes': lf.get('dtypes', {})
            })

        info = data_handler.get_data_info()
        return jsonify(info)

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to get data info: {str(e)}'
        }), 500


@app.route('/api/facets/profile', methods=['GET'])
def facet_profile():
    try:
        session_id = request.args.get('session_id')
        column = request.args.get('column')
        top_n = int(request.args.get('top_n', 20))
        top_n = max(1, min(100, top_n))

        if not column:
            return jsonify({'success': False, 'error': 'column is required'}), 400

        if session_id and session_id in sessions and sessions[session_id].get('large_mode'):
            lf = sessions[session_id].get('large_file', {})
            if lf.get('engine') != 'sqlite':
                return jsonify({'success': False, 'error': 'Large mode engine not supported'}), 400

            columns = lf.get('columns', [])
            if column not in columns:
                return jsonify({'success': False, 'error': 'Invalid column'}), 400

            sqlite_path = lf.get('sqlite_path')
            table_name = lf.get('sqlite_table')
            if not sqlite_path or not table_name or not os.path.exists(sqlite_path):
                return jsonify({'success': False, 'error': 'Large SQLite database not found on server'}), 400

            conn = sqlite3.connect(sqlite_path)
            try:
                total_rows = conn.execute(
                    f'SELECT COUNT(1) FROM "{table_name}"'
                ).fetchone()[0]

                null_rows = conn.execute(
                    f'SELECT COUNT(1) FROM "{table_name}" WHERE "{column}" IS NULL'
                ).fetchone()[0]

                empty_rows = conn.execute(
                    f'SELECT COUNT(1) FROM "{table_name}" WHERE trim(CAST("{column}" AS TEXT)) = ""'
                ).fetchone()[0]

                unique_count = conn.execute(
                    f'SELECT COUNT(DISTINCT "{column}") FROM "{table_name}"'
                ).fetchone()[0]

                top_values = _sqlite_fetch_dicts(
                    conn,
                    (
                        f'SELECT CAST("{column}" AS TEXT) AS value, COUNT(1) AS count '
                        f'FROM "{table_name}" '
                        f'GROUP BY CAST("{column}" AS TEXT) '
                        f'ORDER BY COUNT(1) DESC '
                        f'LIMIT ?'
                    ),
                    (top_n,)
                )

                for r in top_values:
                    if r.get('value') is None:
                        r['value'] = ''
            finally:
                conn.close()

            return jsonify({
                'success': True,
                'column': column,
                'total_rows': int(total_rows),
                'null_rows': int(null_rows),
                'empty_rows': int(empty_rows),
                'unique_count': int(unique_count),
                'top_values': replace_nan_with_none(top_values),
                'large_mode': True
            })

        if data_handler.data is None:
            return jsonify({'success': False, 'error': 'No data loaded'}), 400

        df = data_handler.data
        if column not in df.columns:
            return jsonify({'success': False, 'error': 'Invalid column'}), 400

        series = df[column]
        total_rows = int(len(df))
        null_rows = int(series.isna().sum())
        empty_rows = int(series.astype(str).str.strip().eq('').sum())
        unique_count = int(series.nunique(dropna=True))

        vc = series.astype(str).value_counts(dropna=False).head(top_n)
        top_values = [{'value': str(idx) if idx is not None else '', 'count': int(cnt)} for idx, cnt in vc.items()]

        return jsonify({
            'success': True,
            'column': column,
            'total_rows': total_rows,
            'null_rows': null_rows,
            'empty_rows': empty_rows,
            'unique_count': unique_count,
            'top_values': top_values,
            'large_mode': False
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to build facet profile: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/cluster/suggest', methods=['GET'])
def suggest_clusters():
    try:
        session_id = request.args.get('session_id')
        column = request.args.get('column')
        max_unique = int(request.args.get('max_unique', 2000))
        max_unique = max(50, min(10000, max_unique))

        if not column:
            return jsonify({'success': False, 'error': 'column is required'}), 400

        clusters = {}
        total_unique = 0

        if session_id and session_id in sessions and sessions[session_id].get('large_mode'):
            lf = sessions[session_id].get('large_file', {})
            if lf.get('engine') != 'sqlite':
                return jsonify({'success': False, 'error': 'Large mode engine not supported'}), 400

            columns = lf.get('columns', [])
            if column not in columns:
                return jsonify({'success': False, 'error': 'Invalid column'}), 400

            sqlite_path = lf.get('sqlite_path')
            table_name = lf.get('sqlite_table')
            if not sqlite_path or not table_name or not os.path.exists(sqlite_path):
                return jsonify({'success': False, 'error': 'Large SQLite database not found on server'}), 400

            conn = sqlite3.connect(sqlite_path)
            try:
                _sqlite_ensure_index(conn, table_name, column)
                rows = _sqlite_fetch_dicts(
                    conn,
                    (
                        f'SELECT CAST("{column}" AS TEXT) AS value, COUNT(1) AS count '
                        f'FROM "{table_name}" '
                        f'GROUP BY CAST("{column}" AS TEXT) '
                        f'ORDER BY COUNT(1) DESC '
                        f'LIMIT ?'
                    ),
                    (max_unique,)
                )
            finally:
                conn.close()

            total_unique = len(rows)
            for r in rows:
                val = r.get('value')
                if val is None:
                    continue
                val = str(val)
                fp = _fingerprint(val)
                if fp == '':
                    continue
                clusters.setdefault(fp, []).append({'value': val, 'count': int(r.get('count') or 0)})

        else:
            if data_handler.data is None:
                return jsonify({'success': False, 'error': 'No data loaded'}), 400

            df = data_handler.data
            if column not in df.columns:
                return jsonify({'success': False, 'error': 'Invalid column'}), 400

            vc = df[column].astype(str).value_counts(dropna=False).head(max_unique)
            total_unique = int(vc.shape[0])
            for val, cnt in vc.items():
                if val is None:
                    continue
                val = str(val)
                fp = _fingerprint(val)
                if fp == '':
                    continue
                clusters.setdefault(fp, []).append({'value': val, 'count': int(cnt)})

        cluster_list = []
        for fp, members in clusters.items():
            if len(members) < 2:
                continue
            members_sorted = sorted(members, key=lambda m: (-int(m.get('count', 0)), str(m.get('value', ''))))
            canonical = members_sorted[0]['value']
            cluster_list.append({
                'key': fp,
                'canonical': canonical,
                'members': members_sorted,
                'size': len(members_sorted)
            })

        cluster_list.sort(key=lambda c: (-int(c.get('size', 0)), str(c.get('canonical', ''))))

        return jsonify({
            'success': True,
            'column': column,
            'clusters': cluster_list[:200],
            'unique_scanned': total_unique
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to suggest clusters: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/cluster/apply', methods=['POST'])
def apply_cluster_merge():
    try:
        data = request.get_json() or {}
        session_id = data.get('session_id')
        column = data.get('column')
        canonical = data.get('canonical')
        values = data.get('values') or []

        if not column or canonical is None or not isinstance(values, list) or len(values) == 0:
            return jsonify({'success': False, 'error': 'column, canonical, and values[] are required'}), 400

        values = [str(v) for v in values if v is not None]
        canonical = str(canonical)
        if len(values) == 0:
            return jsonify({'success': False, 'error': 'values[] must not be empty'}), 400

        if session_id and session_id in sessions and sessions[session_id].get('large_mode'):
            lf = sessions[session_id].get('large_file', {})
            if lf.get('engine') != 'sqlite':
                return jsonify({'success': False, 'error': 'Large mode engine not supported'}), 400

            columns = lf.get('columns', [])
            if column not in columns:
                return jsonify({'success': False, 'error': 'Invalid column'}), 400

            sqlite_path = lf.get('sqlite_path')
            table_name = lf.get('sqlite_table')
            if not sqlite_path or not table_name or not os.path.exists(sqlite_path):
                return jsonify({'success': False, 'error': 'Large SQLite database not found on server'}), 400

            placeholders = ','.join(['?'] * len(values))
            conn = sqlite3.connect(sqlite_path)
            try:
                _sqlite_ensure_index(conn, table_name, column)
                cur = conn.execute(
                    f'UPDATE "{table_name}" SET "{column}" = ? WHERE CAST("{column}" AS TEXT) IN ({placeholders})',
                    tuple([canonical] + values)
                )
                conn.commit()
                changed = cur.rowcount
                total_rows = conn.execute(f'SELECT COUNT(1) FROM "{table_name}"').fetchone()[0]
                preview_rows = _sqlite_fetch_dicts(conn, f'SELECT * FROM "{table_name}" LIMIT 100', ())
            finally:
                conn.close()

            lf['total_rows'] = int(total_rows)
            sessions[session_id]['large_file'] = lf
            sessions[session_id]['last_cluster_merge'] = datetime.now().isoformat()
            save_session_data(session_id, sessions[session_id], app.config['SESSION_FOLDER'])

            operation_log = create_operation_log('cluster_merge', {
                'column': column,
                'canonical': canonical,
                'values': values,
                'large_mode': True,
                'changed_rows': int(changed)
            })

            return jsonify({
                'success': True,
                'changed_rows': int(changed),
                'shape': [int(total_rows), len(columns)],
                'data': replace_nan_with_none(preview_rows),
                'operation_log': operation_log,
                'note': 'Large file mode: returned data is a preview of the first 100 rows'
            })

        if data_handler.data is None:
            return jsonify({'success': False, 'error': 'No data loaded'}), 400

        df = data_handler.data
        if column not in df.columns:
            return jsonify({'success': False, 'error': 'Invalid column'}), 400

        data_handler.save_state(f"Cluster merge on {column}")
        mapping = {v: canonical for v in values}
        df[column] = df[column].astype(str).replace(mapping)
        data_handler.data = df
        visualizer.set_data(data_handler.data)
        stats_calculator.set_data(data_handler.data)

        operation_log = create_operation_log('cluster_merge', {
            'column': column,
            'canonical': canonical,
            'values': values,
            'large_mode': False
        })

        return jsonify({
            'success': True,
            'changed_rows': None,
            'data': replace_nan_with_none(data_handler.data.head(100).to_dict('records')),
            'shape': list(data_handler.data.shape),
            'operation_log': operation_log,
            'note': 'Returned data is a preview of the first 100 rows'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to apply cluster merge: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/data/page', methods=['GET'])
def get_data_page():
    try:
        session_id = request.args.get('session_id')
        if not session_id:
            return jsonify({'success': False, 'error': 'session_id is required'}), 400

        if session_id not in sessions or not sessions[session_id].get('large_mode'):
            return jsonify({'success': False, 'error': 'Session is not in large file mode'}), 400

        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 50))
        lf = sessions[session_id].get('large_file', {})

        columns = lf.get('columns', [])
        if not columns:
            return jsonify({'success': False, 'error': 'Large file metadata is missing columns'}), 400

        sort_column = request.args.get('sort_column')
        sort_dir = (request.args.get('sort_dir') or 'asc').lower()
        if sort_dir not in ('asc', 'desc'):
            sort_dir = 'asc'

        filter_column = request.args.get('filter_column')
        filter_operator = request.args.get('filter_operator')
        filter_value = request.args.get('filter_value')

        search_term = request.args.get('search_term')

        if sort_column and sort_column not in columns:
            return jsonify({'success': False, 'error': 'Invalid sort column'}), 400
        if filter_column and filter_column not in columns:
            return jsonify({'success': False, 'error': 'Invalid filter column'}), 400

        engine = lf.get('engine')
        if engine != 'sqlite':
            return jsonify({'success': False, 'error': 'Large file engine not supported'}), 400

        sqlite_path = lf.get('sqlite_path')
        table_name = lf.get('sqlite_table')
        if not sqlite_path or not table_name or not os.path.exists(sqlite_path):
            return jsonify({'success': False, 'error': 'Large SQLite database not found on server'}), 400

        where_clauses = []
        where_params = []
        if filter_column and filter_operator and filter_value is not None and str(filter_value).strip() != '':
            val = str(filter_value).strip()
            col_sql = f'"{filter_column}"'
            op = filter_operator

            if op == 'equals':
                where_clauses.append(f'lower(CAST({col_sql} AS TEXT)) = lower(?)')
                where_params.append(val)
            elif op == 'not_equals':
                where_clauses.append(f'lower(CAST({col_sql} AS TEXT)) != lower(?)')
                where_params.append(val)
            elif op == 'contains':
                where_clauses.append(f'lower(CAST({col_sql} AS TEXT)) LIKE lower(?)')
                where_params.append(f'%{val}%')
            elif op == 'not_contains':
                where_clauses.append(f'lower(CAST({col_sql} AS TEXT)) NOT LIKE lower(?)')
                where_params.append(f'%{val}%')
            elif op == 'greater_than':
                where_clauses.append(f'CAST({col_sql} AS REAL) > CAST(? AS REAL)')
                where_params.append(val)
            elif op == 'less_than':
                where_clauses.append(f'CAST({col_sql} AS REAL) < CAST(? AS REAL)')
                where_params.append(val)
            else:
                return jsonify({'success': False, 'error': 'Invalid filter operator'}), 400

        if search_term is not None and str(search_term).strip() != '':
            s = str(search_term).strip()
            like_val = f'%{s}%'
            search_clauses = []
            for c in columns:
                search_clauses.append(f'lower(CAST("{c}" AS TEXT)) LIKE lower(?)')
                where_params.append(like_val)
            where_clauses.append('(' + ' OR '.join(search_clauses) + ')')

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ''

        order_sql = ''
        if sort_column:
            order_sql = f'ORDER BY "{sort_column}" {sort_dir.upper()}'

        page = max(1, page)
        page_size = max(1, min(500, page_size))
        offset = (page - 1) * page_size

        conn = sqlite3.connect(sqlite_path)
        try:
            if filter_column:
                _sqlite_ensure_index(conn, table_name, filter_column)
            if sort_column:
                _sqlite_ensure_index(conn, table_name, sort_column)

            total_rows = conn.execute(
                f'SELECT COUNT(1) FROM "{table_name}" {where_sql}',
                tuple(where_params)
            ).fetchone()[0]

            rows = _sqlite_fetch_dicts(
                conn,
                f'SELECT * FROM "{table_name}" {where_sql} {order_sql} LIMIT ? OFFSET ?',
                tuple(where_params) + (page_size, offset)
            )
        finally:
            conn.close()

        data_dict = replace_nan_with_none(rows)
        return jsonify({
            'success': True,
            'data': data_dict,
            'page': page,
            'page_size': page_size,
            'total_rows': total_rows,
            'columns': columns
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to get page: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500


@app.route('/api/download', methods=['POST'])
def download_data():
    """
    Download processed data in specified format
    
    Expected JSON payload:
    {
        "format": "csv|excel|json|sql",
        "filename": "optional_filename",
        "session_id": "optional - required for SQL export in large (SQLite) mode"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'format' not in data:
            return jsonify({'success': False, 'error': 'No format specified'}), 400
        
        format_type = data['format']
        filename = data.get('filename') or 'exported_data'
        session_id = data.get('session_id')

        # SQL export: support both in-memory and large (SQLite) mode with MySQL-compatible output
        if format_type == 'sql':
            table_name = (filename or 'exported_data').strip()
            out_filename = f'{filename}.sql' if not filename.endswith('.sql') else filename
            if not out_filename.endswith('.sql'):
                out_filename = out_filename + '.sql'

            if session_id and session_id in sessions and sessions[session_id].get('large_mode'):
                lf = sessions[session_id].get('large_file', {})
                if lf.get('engine') != 'sqlite':
                    return jsonify({'success': False, 'error': 'Large mode engine not supported for SQL export'}), 400
                sqlite_path = lf.get('sqlite_path')
                table_name_sqlite = lf.get('sqlite_table')
                columns = lf.get('columns', [])
                if not sqlite_path or not table_name_sqlite or not os.path.exists(sqlite_path):
                    return jsonify({'success': False, 'error': 'Large SQLite database not found on server'}), 400
                conn = sqlite3.connect(sqlite_path)
                try:
                    conn.row_factory = sqlite3.Row
                    cur = conn.execute(f'SELECT * FROM "{table_name_sqlite}"')
                    def row_gen():
                        for row in cur:
                            yield {k: row[k] for k in row.keys()}
                    sql_str = export_to_mysql_sql(columns, row_gen(), table_name=table_name)
                finally:
                    conn.close()
                file_obj = io.BytesIO(sql_str.encode('utf-8'))
                file_obj.seek(0)
                response = send_file(
                    file_obj,
                    as_attachment=True,
                    download_name=out_filename,
                    mimetype='text/plain; charset=utf-8'
                )
                response.headers['Access-Control-Allow-Origin'] = '*'
                response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
                response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
                return response
            elif data_handler.data is not None:
                export_result = data_handler.export_data('sql', (filename or 'exported_data').replace('.sql', ''))
                if not export_result['success']:
                    return jsonify(export_result), 400
                file_obj = io.BytesIO(export_result['data'].encode('utf-8'))
                file_obj.seek(0)
                response = send_file(
                    file_obj,
                    as_attachment=True,
                    download_name=export_result['filename'],
                    mimetype='text/plain; charset=utf-8'
                )
                response.headers['Access-Control-Allow-Origin'] = '*'
                response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
                response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
                return response
            else:
                return jsonify({
                    'success': False,
                    'error': 'No data available to download. Please upload a file first.'
                }), 400

        # Non-SQL: require in-memory data
        if data_handler.data is None:
            return jsonify({
                'success': False,
                'error': 'No data available to download. Please upload a file first.'
            }), 400
        
        export_result = data_handler.export_data(format_type, filename)
        
        if not export_result['success']:
            return jsonify(export_result), 400
        
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
            
            file_obj.seek(0)
            
            file_size = len(export_result['data']) if isinstance(export_result['data'], (str, bytes)) else len(file_obj.getvalue())
            print(f"Downloading file: {export_result['filename']}, size: {file_size} bytes, format: {format_type}")
            
            response = send_file(
                file_obj,
                as_attachment=True,
                download_name=export_result['filename'],
                mimetype=mimetype
            )
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
    print(f"Max upload size: {app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)}MB")
    print(f"Upload folder: {app.config['UPLOAD_FOLDER']}")
    print(f"Session folder: {app.config['SESSION_FOLDER']}")
    print(f"Server running on http://0.0.0.0:{port}")

    open_browser = os.environ.get('ALCH_OPEN_BROWSER', '1').lower() not in {'0', 'false', 'no'}
    is_reloader_child = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    if open_browser and not is_reloader_child:
        url = f"http://127.0.0.1:{port}"
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    app.run(debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true', host='0.0.0.0', port=port)
