"""
Data Handler Module for Alchemist

This module provides functions for data cleaning, filtering, and transformation operations.
Supports CSV, Excel, and JSON file formats.
"""

import pandas as pd
import numpy as np
import json
from typing import Dict, List, Any, Optional
import io
import sys
import os

# Add utils to path for helper functions
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from utils.helpers import replace_nan_with_none


class DataHandler:
    """Main class for handling data operations"""
    
    def __init__(self):
        self.data = None
        self.original_data = None
        
    def load_data(self, file_content: bytes, file_type: str, **kwargs) -> Dict[str, Any]:
        """
        Load data from uploaded file
        
        Args:
            file_content: Raw file content as bytes
            file_type: Type of file ('csv', 'excel', 'json')
            **kwargs: Additional parameters for pandas readers
            
        Returns:
            Dict containing loaded data and metadata
        """
        # Reset state before loading new data
        self.data = None
        self.original_data = None
        
        try:
            if file_type == 'csv':
                self.data = pd.read_csv(io.BytesIO(file_content), **kwargs)
            elif file_type == 'excel':
                self.data = pd.read_excel(io.BytesIO(file_content), **kwargs)
            elif file_type == 'json':
                # Try different JSON formats that pandas supports
                json_content = file_content.decode('utf-8')
                json_data = json.loads(json_content)
                
                # Handle different JSON structures
                if isinstance(json_data, list):
                    # Array of objects - pandas can handle this directly
                    self.data = pd.read_json(io.BytesIO(file_content), orient='records', **kwargs)
                elif isinstance(json_data, dict):
                    # Check if it's a nested structure that needs flattening
                    if any(isinstance(v, (list, dict)) for v in json_data.values()):
                        # Try to normalize nested JSON
                        try:
                            self.data = pd.json_normalize(json_data)
                        except:
                            # Fallback: try reading as records
                            self.data = pd.read_json(io.BytesIO(file_content), **kwargs)
                    else:
                        # Simple flat dict - convert to DataFrame
                        self.data = pd.DataFrame([json_data])
                else:
                    # Try pandas default reading
                    self.data = pd.read_json(io.BytesIO(file_content), **kwargs)
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
                
            self.original_data = self.data.copy()
            print(f"DataFrame created: shape={self.data.shape}, columns={len(self.data.columns)}")
            
            # Convert dtypes to string for JSON serialization
            print("Converting dtypes...")
            dtypes_dict = {str(k): str(v) for k, v in self.data.dtypes.to_dict().items()}
            
            # Only convert preview data for response - full data stays as DataFrame
            # This avoids timeout on large files
            print("Creating preview dict (first 100 rows)...")
            preview_df = self.data.head(100)  # Get first 100 rows for preview
            preview_dict = preview_df.to_dict('records')
            print("Preview dict created")
            
            # For the response, send preview data only
            # Full data remains in self.data DataFrame for operations
            print("Preparing response data...")
            data_to_send = replace_nan_with_none(preview_dict)
            
            return {
                'success': True,
                'data': data_to_send,  # Preview data only
                'columns': list(self.data.columns),
                'shape': list(self.data.shape),  # Full shape info
                'dtypes': dtypes_dict,
                'preview': replace_nan_with_none(preview_dict),
                'note': 'Full dataset loaded and available for operations'
            }
        except json.JSONDecodeError as e:
            # Reset state on error
            self.data = None
            self.original_data = None
            return {'success': False, 'error': f'Invalid JSON format: {str(e)}'}
        except Exception as e:
            # Reset state on error
            self.data = None
            self.original_data = None
            return {'success': False, 'error': f'Error loading {file_type} file: {str(e)}'}
    
    def clean_data(self, operations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Perform data cleaning operations
        
        Args:
            operations: List of cleaning operations to perform
            
        Returns:
            Dict containing cleaned data and operation results
        """
        try:
            results = []
            
            for operation in operations:
                op_type = operation.get('type')
                
                if op_type == 'remove_duplicates':
                    before_count = len(self.data)
                    self.data = self.data.drop_duplicates()
                    after_count = len(self.data)
                    results.append({
                        'operation': 'remove_duplicates',
                        'removed': before_count - after_count
                    })
                    
                elif op_type == 'fill_missing':
                    column = operation.get('column')
                    method = operation.get('method', 'mean')
                    value = operation.get('value')
                    
                    if method == 'mean' and self.data[column].dtype in ['int64', 'float64']:
                        fill_value = self.data[column].mean()
                    elif method == 'median' and self.data[column].dtype in ['int64', 'float64']:
                        fill_value = self.data[column].median()
                    elif method == 'mode':
                        fill_value = self.data[column].mode().iloc[0] if not self.data[column].mode().empty else value
                    else:
                        fill_value = value
                        
                    missing_before = self.data[column].isnull().sum()
                    self.data[column] = self.data[column].fillna(fill_value)
                    missing_after = self.data[column].isnull().sum()
                    
                    results.append({
                        'operation': 'fill_missing',
                        'column': column,
                        'filled': missing_before - missing_after
                    })
                    
                elif op_type == 'remove_missing':
                    columns = operation.get('columns', [])
                    how = operation.get('how', 'any')
                    before_count = len(self.data)
                    
                    if columns:
                        self.data = self.data.dropna(subset=columns, how=how)
                    else:
                        self.data = self.data.dropna(how=how)
                        
                    after_count = len(self.data)
                    results.append({
                        'operation': 'remove_missing',
                        'removed': before_count - after_count
                    })
                    
                elif op_type == 'convert_type':
                    column = operation.get('column')
                    target_type = operation.get('target_type')
                    
                    try:
                        self.data[column] = self.data[column].astype(target_type)
                        results.append({
                            'operation': 'convert_type',
                            'column': column,
                            'from_type': str(self.original_data[column].dtype),
                            'to_type': target_type
                        })
                    except Exception as e:
                        results.append({
                            'operation': 'convert_type',
                            'column': column,
                            'error': str(e)
                        })
                        
                elif op_type == 'remove_outliers':
                    column = operation.get('column')
                    method = operation.get('method', 'iqr')
                    
                    if method == 'iqr':
                        Q1 = self.data[column].quantile(0.25)
                        Q3 = self.data[column].quantile(0.75)
                        IQR = Q3 - Q1
                        lower_bound = Q1 - 1.5 * IQR
                        upper_bound = Q3 + 1.5 * IQR
                        
                        before_count = len(self.data)
                        self.data = self.data[
                            (self.data[column] >= lower_bound) & 
                            (self.data[column] <= upper_bound)
                        ]
                        after_count = len(self.data)
                        
                        results.append({
                            'operation': 'remove_outliers',
                            'column': column,
                            'method': method,
                            'removed': before_count - after_count
                        })
                        
            # Convert DataFrame to dict and replace NaN with None for JSON serialization
            data_dict = self.data.to_dict('records')
            
            return {
                'success': True,
                'data': replace_nan_with_none(data_dict),
                'shape': list(self.data.shape),  # Convert tuple to list for JSON
                'results': results
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def filter_data(self, filters: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Apply filters to the data
        
        Args:
            filters: List of filter conditions
            
        Returns:
            Dict containing filtered data
        """
        try:
            filtered_data = self.data.copy()
            
            for filter_condition in filters:
                column = filter_condition.get('column')
                operator = filter_condition.get('operator')
                value = filter_condition.get('value')
                
                if operator == 'equals':
                    filtered_data = filtered_data[filtered_data[column] == value]
                elif operator == 'not_equals':
                    filtered_data = filtered_data[filtered_data[column] != value]
                elif operator == 'greater_than':
                    filtered_data = filtered_data[filtered_data[column] > value]
                elif operator == 'less_than':
                    filtered_data = filtered_data[filtered_data[column] < value]
                elif operator == 'contains':
                    filtered_data = filtered_data[
                        filtered_data[column].astype(str).str.contains(str(value), na=False)
                    ]
                elif operator == 'not_contains':
                    filtered_data = filtered_data[
                        ~filtered_data[column].astype(str).str.contains(str(value), na=False)
                    ]
                    
            # Convert DataFrame to dict and replace NaN with None for JSON serialization
            filtered_dict = filtered_data.to_dict('records')
            
            return {
                'success': True,
                'data': replace_nan_with_none(filtered_dict),
                'shape': list(filtered_data.shape)  # Convert tuple to list for JSON
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def transform_data(self, transformations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Apply data transformations
        
        Args:
            transformations: List of transformation operations
            
        Returns:
            Dict containing transformed data
        """
        try:
            for transformation in transformations:
                op_type = transformation.get('type')
                
                if op_type == 'create_column':
                    new_column = transformation.get('new_column')
                    expression = transformation.get('expression')
                    self.data[new_column] = self.data.eval(expression)
                    
                elif op_type == 'rename_column':
                    old_name = transformation.get('old_name')
                    new_name = transformation.get('new_name')
                    self.data = self.data.rename(columns={old_name: new_name})
                    
                elif op_type == 'drop_column':
                    columns = transformation.get('columns', [])
                    self.data = self.data.drop(columns=columns, errors='ignore')
                    
                elif op_type == 'sort':
                    columns = transformation.get('columns', [])
                    ascending = transformation.get('ascending', True)
                    self.data = self.data.sort_values(by=columns, ascending=ascending)
                    
                elif op_type == 'group_aggregate':
                    group_by = transformation.get('group_by', [])
                    aggregations = transformation.get('aggregations', {})
                    self.data = self.data.groupby(group_by).agg(aggregations).reset_index()
                    
            # Convert DataFrame to dict and replace NaN with None for JSON serialization
            data_dict = self.data.to_dict('records')
            
            return {
                'success': True,
                'data': replace_nan_with_none(data_dict),
                'shape': list(self.data.shape),  # Convert tuple to list for JSON
                'columns': list(self.data.columns)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def export_data(self, format_type: str, filename: str = None) -> Dict[str, Any]:
        """
        Export data in specified format
        
        Args:
            format_type: Export format ('csv', 'excel', 'json')
            filename: Optional custom filename (without extension)
            
        Returns:
            Dict containing exported data
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data to export'}
            
            # Determine filename
            if not filename:
                filename = 'cleaned_data'
            
            if format_type == 'csv':
                output = self.data.to_csv(index=False)
                return {'success': True, 'data': output, 'filename': f'{filename}.csv'}
            elif format_type == 'excel':
                output = io.BytesIO()
                self.data.to_excel(output, index=False, engine='openpyxl')
                output.seek(0)
                return {'success': True, 'data': output.getvalue(), 'filename': f'{filename}.xlsx'}
            elif format_type == 'json':
                # Replace NaN with None for JSON serialization
                data_dict = self.data.to_dict('records')
                output = json.dumps(replace_nan_with_none(data_dict), indent=2)
                return {'success': True, 'data': output, 'filename': f'{filename}.json'}
            else:
                return {'success': False, 'error': f'Unsupported format: {format_type}'}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_data_info(self) -> Dict[str, Any]:
        """
        Get comprehensive information about the current dataset
        
        Returns:
            Dict containing dataset information
        """
        if self.data is None:
            return {'success': False, 'error': 'No data loaded'}
            
        try:
            info = {
                'success': True,
                'shape': self.data.shape,
                'columns': list(self.data.columns),
                'dtypes': self.data.dtypes.to_dict(),
                'missing_values': self.data.isnull().sum().to_dict(),
                'memory_usage': self.data.memory_usage(deep=True).sum(),
                'numeric_columns': list(self.data.select_dtypes(include=[np.number]).columns),
                'categorical_columns': list(self.data.select_dtypes(include=['object', 'category']).columns),
                'datetime_columns': list(self.data.select_dtypes(include=['datetime64']).columns)
            }
            
            return info
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
