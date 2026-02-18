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
        try:
            if file_type == 'csv':
                self.data = pd.read_csv(io.BytesIO(file_content), **kwargs)
            elif file_type == 'excel':
                self.data = pd.read_excel(io.BytesIO(file_content), **kwargs)
            elif file_type == 'json':
                self.data = pd.read_json(io.BytesIO(file_content), **kwargs)
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
                
            self.original_data = self.data.copy()
            
            return {
                'success': True,
                'data': self.data.to_dict('records'),
                'columns': list(self.data.columns),
                'shape': self.data.shape,
                'dtypes': self.data.dtypes.to_dict(),
                'preview': self.data.head(10).to_dict('records')
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
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
                        
            return {
                'success': True,
                'data': self.data.to_dict('records'),
                'shape': self.data.shape,
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
                    
            return {
                'success': True,
                'data': filtered_data.to_dict('records'),
                'shape': filtered_data.shape
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
                    
            return {
                'success': True,
                'data': self.data.to_dict('records'),
                'shape': self.data.shape,
                'columns': list(self.data.columns)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def export_data(self, format_type: str) -> Dict[str, Any]:
        """
        Export data in specified format
        
        Args:
            format_type: Export format ('csv', 'excel', 'json')
            
        Returns:
            Dict containing exported data
        """
        try:
            if format_type == 'csv':
                output = self.data.to_csv(index=False)
                return {'success': True, 'data': output, 'filename': 'cleaned_data.csv'}
            elif format_type == 'excel':
                output = io.BytesIO()
                self.data.to_excel(output, index=False, engine='openpyxl')
                output.seek(0)
                return {'success': True, 'data': output.getvalue(), 'filename': 'cleaned_data.xlsx'}
            elif format_type == 'json':
                output = self.data.to_json(orient='records', indent=2)
                return {'success': True, 'data': output, 'filename': 'cleaned_data.json'}
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
