"""
Helper utilities for Alchemist

This module contains utility functions for file handling, data validation,
and common operations used across the application.
"""

import os
import uuid
import hashlib
import json
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Union
from datetime import datetime
import mimetypes


def replace_nan_with_none(obj: Any) -> Any:
    """
    Recursively replace NaN values with None for JSON serialization
    
    Args:
        obj: Object that may contain NaN values
        
    Returns:
        Object with NaN replaced by None
    """
    if isinstance(obj, dict):
        return {k: replace_nan_with_none(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [replace_nan_with_none(item) for item in obj]
    elif isinstance(obj, (float, np.floating)) and (pd.isna(obj) or np.isnan(obj)):
        return None
    elif isinstance(obj, (int, np.integer)) and pd.isna(obj):
        return None
    else:
        return obj


def generate_unique_id() -> str:
    """
    Generate a unique identifier for files or sessions
    
    Returns:
        Unique string identifier
    """
    return str(uuid.uuid4())


def generate_file_hash(file_content: bytes) -> str:
    """
    Generate SHA-256 hash of file content
    
    Args:
        file_content: Raw file content as bytes
        
    Returns:
        SHA-256 hash string
    """
    return hashlib.sha256(file_content).hexdigest()


def get_file_type(file_content: bytes, filename: str) -> str:
    """
    Determine file type based on content and filename
    
    Args:
        file_content: Raw file content as bytes
        filename: Original filename
        
    Returns:
        File type string ('csv', 'excel', 'json', 'unknown')
    """
    # Check file extension first
    _, ext = os.path.splitext(filename.lower())
    
    if ext in ['.csv']:
        return 'csv'
    elif ext in ['.xlsx', '.xls', '.xlsm']:
        return 'excel'
    elif ext in ['.json']:
        return 'json'
    
    # Check MIME type
    mime_type, _ = mimetypes.guess_type(filename)
    if mime_type:
        if 'csv' in mime_type:
            return 'csv'
        elif 'excel' in mime_type or 'spreadsheet' in mime_type:
            return 'excel'
        elif 'json' in mime_type:
            return 'json'
    
    # Try to detect by content
    try:
        # Try JSON first
        json.loads(file_content.decode('utf-8'))
        return 'json'
    except (json.JSONDecodeError, UnicodeDecodeError):
        pass
    
    # Try CSV by checking for commas and newlines
    try:
        content_str = file_content.decode('utf-8')
        if ',' in content_str and '\n' in content_str:
            # Simple heuristic for CSV
            lines = content_str.split('\n')[:5]  # Check first 5 lines
            if all(',' in line for line in lines if line.strip()):
                return 'csv'
    except:
        pass
    
    return 'unknown'


def validate_file_size(file_content: bytes, max_size_mb: int = 100) -> Dict[str, Any]:
    """
    Validate file size against maximum limit
    
    Args:
        file_content: Raw file content as bytes
        max_size_mb: Maximum allowed file size in MB
        
    Returns:
        Dict containing validation result
    """
    file_size = len(file_content)
    max_size_bytes = max_size_mb * 1024 * 1024
    
    return {
        'valid': file_size <= max_size_bytes,
        'file_size_mb': file_size / (1024 * 1024),
        'max_size_mb': max_size_mb,
        'message': f'File size is {file_size / (1024 * 1024):.2f} MB' + 
                  (f' (max: {max_size_mb} MB)' if file_size > max_size_bytes else '')
    }


def validate_dataframe_structure(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Validate DataFrame structure and content
    
    Args:
        df: pandas DataFrame to validate
        
    Returns:
        Dict containing validation results
    """
    try:
        # Check if DataFrame is None
        if df is None:
            return {
                'valid': False,
                'errors': ['DataFrame is None'],
                'warnings': [],
                'info': {}
            }
        
        # Convert dtypes to string for JSON serialization
        dtypes_dict = {str(k): str(v) for k, v in df.dtypes.to_dict().items()}
        
        validation_results = {
            'valid': True,
            'errors': [],
            'warnings': [],
            'info': {
                'shape': list(df.shape),  # Convert tuple to list for JSON
                'columns': list(df.columns),
                'dtypes': dtypes_dict,
                'memory_usage_mb': float(df.memory_usage(deep=True).sum() / (1024 * 1024))
            }
        }
        
        # Check for empty DataFrame
        if df.empty:
            validation_results['valid'] = False
            validation_results['errors'].append('DataFrame is empty')
            return validation_results
        
        # Check for duplicate column names
        if len(df.columns) != len(set(df.columns)):
            validation_results['valid'] = False
            validation_results['errors'].append('Duplicate column names found')
        
        # Check for columns with all NaN values
        nan_columns = df.columns[df.isnull().all()].tolist()
        if nan_columns:
            validation_results['warnings'].append(f'Columns with all NaN values: {nan_columns}')
        
        # Check for extremely high cardinality in categorical columns
        for col in df.select_dtypes(include=['object', 'category']).columns:
            unique_ratio = df[col].nunique() / len(df)
            if unique_ratio > 0.95:
                validation_results['warnings'].append(
                    f'Column "{col}" has very high cardinality ({unique_ratio:.2%})'
                )
        
        return validation_results
        
    except Exception as e:
        return {
            'valid': False,
            'errors': [f'Validation error: {str(e)}'],
            'warnings': [],
            'info': {}
        }


def sanitize_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """
    Sanitize column names for better compatibility
    
    Args:
        df: pandas DataFrame with original column names
        
    Returns:
        DataFrame with sanitized column names
    """
    if df is None:
        return None
    
    df_copy = df.copy()
    
    # Create a mapping of old to new column names
    name_mapping = {}
    
    for col in df_copy.columns:
        # Convert to string and strip whitespace
        new_name = str(col).strip()
        
        # Replace spaces and special characters with underscores
        new_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in new_name)
        
        # Remove multiple consecutive underscores
        while '__' in new_name:
            new_name = new_name.replace('__', '_')
        
        # Remove leading/trailing underscores
        new_name = new_name.strip('_')
        
        # Ensure it doesn't start with a number
        if new_name and new_name[0].isdigit():
            new_name = 'col_' + new_name
        
        # Ensure it's not empty
        if not new_name:
            new_name = 'unnamed_column'
        
        # Make unique
        original_new_name = new_name
        counter = 1
        while new_name in name_mapping.values():
            new_name = f"{original_new_name}_{counter}"
            counter += 1
        
        name_mapping[col] = new_name
    
    # Rename columns
    df_copy = df_copy.rename(columns=name_mapping)
    
    return df_copy


def create_data_preview(df: pd.DataFrame, max_rows: int = 100) -> Dict[str, Any]:
    """
    Create a preview of the dataset
    
    Args:
        df: pandas DataFrame to preview
        max_rows: Maximum number of rows to include in preview
        
    Returns:
        Dict containing preview data
    """
    try:
        # Check if DataFrame is None
        if df is None:
            return {
                'success': False,
                'error': 'DataFrame is None'
            }
        
        # Limit rows for preview
        preview_df = df.head(max_rows)
        
        # Create column info
        column_info = {}
        for col in df.columns:
            col_data = df[col]
            column_info[col] = {
                'dtype': str(col_data.dtype),
                'non_null_count': int(col_data.count()),
                'null_count': int(col_data.isnull().sum()),
                'unique_count': int(col_data.nunique()),
                'sample_values': col_data.dropna().head(5).tolist() if not col_data.isnull().all() else []
            }
        
        # Convert DataFrame to dict and replace NaN with None for JSON serialization
        preview_dict = preview_df.to_dict('records')
        
        return {
            'success': True,
            'data': replace_nan_with_none(preview_dict),
            'columns': list(df.columns),
            'shape': list(df.shape),  # Convert tuple to list for JSON
            'preview_rows': len(preview_df),
            'column_info': replace_nan_with_none(column_info)
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def format_number(value: Union[int, float], precision: int = 2) -> str:
    """
    Format numbers for display
    
    Args:
        value: Number to format
        precision: Number of decimal places
        
    Returns:
        Formatted string
    """
    if pd.isna(value):
        return 'N/A'
    
    if isinstance(value, int):
        return f"{value:,}"
    elif isinstance(value, float):
        if abs(value) >= 1e6:
            return f"{value:.{precision}e}"
        else:
            return f"{value:,.{precision}f}"
    else:
        return str(value)


def create_operation_log(operation_type: str, details: Dict[str, Any], 
                       user_id: str = None) -> Dict[str, Any]:
    """
    Create a log entry for data operations
    
    Args:
        operation_type: Type of operation performed
        details: Details about the operation
        user_id: Optional user identifier
        
    Returns:
        Dict containing log entry
    """
    return {
        'timestamp': datetime.now().isoformat(),
        'operation_type': operation_type,
        'details': details,
        'user_id': user_id,
        'log_id': generate_unique_id()
    }


def save_session_data(session_id: str, data: Dict[str, Any], 
                     storage_path: str = 'data/sessions') -> bool:
    """
    Save session data to disk
    
    Args:
        session_id: Unique session identifier
        data: Data to save
        storage_path: Path to store session files
        
    Returns:
        True if successful, False otherwise
    """
    try:
        os.makedirs(storage_path, exist_ok=True)
        session_file = os.path.join(storage_path, f"{session_id}.json")
        
        with open(session_file, 'w') as f:
            json.dump(data, f, indent=2, default=str)
        
        return True
        
    except Exception:
        return False


def load_session_data(session_id: str, 
                     storage_path: str = 'data/sessions') -> Optional[Dict[str, Any]]:
    """
    Load session data from disk
    
    Args:
        session_id: Unique session identifier
        storage_path: Path where session files are stored
        
    Returns:
        Session data dict or None if not found
    """
    try:
        session_file = os.path.join(storage_path, f"{session_id}.json")
        
        if not os.path.exists(session_file):
            return None
        
        with open(session_file, 'r') as f:
            return json.load(f)
        
    except Exception:
        return None


def cleanup_old_sessions(max_age_hours: int = 24, 
                        storage_path: str = 'data/sessions') -> int:
    """
    Clean up old session files
    
    Args:
        max_age_hours: Maximum age in hours before cleanup
        storage_path: Path where session files are stored
        
    Returns:
        Number of files cleaned up
    """
    try:
        if not os.path.exists(storage_path):
            return 0
        
        cleaned_count = 0
        current_time = datetime.now()
        
        for filename in os.listdir(storage_path):
            if filename.endswith('.json'):
                file_path = os.path.join(storage_path, filename)
                file_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                
                if (current_time - file_time).total_seconds() > max_age_hours * 3600:
                    os.remove(file_path)
                    cleaned_count += 1
        
        return cleaned_count
        
    except Exception:
        return 0


def export_to_format(data: pd.DataFrame, format_type: str, 
                    filename: str = None) -> Dict[str, Any]:
    """
    Export DataFrame to specified format
    
    Args:
        data: pandas DataFrame to export
        format_type: Export format ('csv', 'excel', 'json')
        filename: Optional filename
        
    Returns:
        Dict containing export result
    """
    try:
        if filename is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"export_{timestamp}"
        
        if format_type == 'csv':
            output = data.to_csv(index=False)
            return {
                'success': True,
                'data': output,
                'filename': f"{filename}.csv",
                'mime_type': 'text/csv'
            }
        
        elif format_type == 'excel':
            import io
            output = io.BytesIO()
            data.to_excel(output, index=False, engine='openpyxl')
            output.seek(0)
            return {
                'success': True,
                'data': output.getvalue(),
                'filename': f"{filename}.xlsx",
                'mime_type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        
        elif format_type == 'json':
            output = data.to_json(orient='records', indent=2)
            return {
                'success': True,
                'data': output,
                'filename': f"{filename}.json",
                'mime_type': 'application/json'
            }
        
        else:
            return {
                'success': False,
                'error': f'Unsupported export format: {format_type}'
            }
            
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }
