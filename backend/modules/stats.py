"""
Statistics Module for Alchemist

This module provides functions for calculating descriptive statistics,
aggregations, and advanced statistical analysis on datasets.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Union
from scipy import stats
import warnings
warnings.filterwarnings('ignore')


class StatisticsCalculator:
    """Main class for statistical calculations"""
    
    def __init__(self):
        self.data = None
        
    def set_data(self, data: pd.DataFrame):
        """
        Set the data for statistical analysis
        
        Args:
            data: pandas DataFrame to analyze
        """
        self.data = data
        
    def descriptive_statistics(self, columns: List[str] = None) -> Dict[str, Any]:
        """
        Calculate comprehensive descriptive statistics
        
        Args:
            columns: List of columns to analyze (if None, analyze all numeric columns)
            
        Returns:
            Dict containing descriptive statistics
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
            
            if columns:
                numeric_data = self.data[columns].select_dtypes(include=[np.number])
            else:
                numeric_data = self.data.select_dtypes(include=[np.number])
            
            if numeric_data.empty:
                return {'success': False, 'error': 'No numeric columns found'}
            
            # Calculate basic statistics
            stats_dict = {}
            
            for column in numeric_data.columns:
                col_data = numeric_data[column].dropna()
                
                if len(col_data) == 0:
                    continue
                
                stats_dict[column] = {
                    'count': len(col_data),
                    'mean': float(col_data.mean()),
                    'median': float(col_data.median()),
                    'mode': float(col_data.mode().iloc[0]) if not col_data.mode().empty else None,
                    'std': float(col_data.std()),
                    'var': float(col_data.var()),
                    'min': float(col_data.min()),
                    'max': float(col_data.max()),
                    'q1': float(col_data.quantile(0.25)),
                    'q3': float(col_data.quantile(0.75)),
                    'iqr': float(col_data.quantile(0.75) - col_data.quantile(0.25)),
                    'skewness': float(stats.skew(col_data)),
                    'kurtosis': float(stats.kurtosis(col_data)),
                    'missing_count': int(numeric_data[column].isnull().sum()),
                    'missing_percentage': float((numeric_data[column].isnull().sum() / len(numeric_data)) * 100)
                }
            
            return {
                'success': True,
                'statistics': stats_dict,
                'total_rows': len(self.data),
                'analyzed_columns': list(stats_dict.keys())
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def categorical_statistics(self, columns: List[str] = None) -> Dict[str, Any]:
        """
        Calculate statistics for categorical columns
        
        Args:
            columns: List of columns to analyze (if None, analyze all categorical columns)
            
        Returns:
            Dict containing categorical statistics
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
            
            if columns:
                categorical_data = self.data[columns].select_dtypes(include=['object', 'category'])
            else:
                categorical_data = self.data.select_dtypes(include=['object', 'category'])
            
            if categorical_data.empty:
                return {'success': False, 'error': 'No categorical columns found'}
            
            stats_dict = {}
            
            for column in categorical_data.columns:
                col_data = categorical_data[column].dropna()
                
                if len(col_data) == 0:
                    continue
                
                value_counts = col_data.value_counts()
                
                stats_dict[column] = {
                    'count': len(col_data),
                    'unique_count': len(value_counts),
                    'most_frequent': str(value_counts.index[0]) if len(value_counts) > 0 else None,
                    'most_frequent_count': int(value_counts.iloc[0]) if len(value_counts) > 0 else 0,
                    'least_frequent': str(value_counts.index[-1]) if len(value_counts) > 0 else None,
                    'least_frequent_count': int(value_counts.iloc[-1]) if len(value_counts) > 0 else 0,
                    'missing_count': int(categorical_data[column].isnull().sum()),
                    'missing_percentage': float((categorical_data[column].isnull().sum() / len(categorical_data)) * 100),
                    'top_5_values': {str(k): int(v) for k, v in value_counts.head().items()}
                }
            
            return {
                'success': True,
                'statistics': stats_dict,
                'total_rows': len(self.data),
                'analyzed_columns': list(stats_dict.keys())
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def correlation_analysis(self, columns: List[str] = None, method: str = 'pearson') -> Dict[str, Any]:
        """
        Calculate correlation matrix and significant correlations
        
        Args:
            columns: List of columns to analyze (if None, analyze all numeric columns)
            method: Correlation method ('pearson', 'spearman', 'kendall')
            
        Returns:
            Dict containing correlation analysis
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
            
            if columns:
                numeric_data = self.data[columns].select_dtypes(include=[np.number])
            else:
                numeric_data = self.data.select_dtypes(include=[np.number])
            
            if numeric_data.empty:
                return {'success': False, 'error': 'No numeric columns found'}
            
            # Calculate correlation matrix
            corr_matrix = numeric_data.corr(method=method)
            
            # Find significant correlations (absolute value > 0.5)
            significant_correlations = []
            for i in range(len(corr_matrix.columns)):
                for j in range(i+1, len(corr_matrix.columns)):
                    col1 = corr_matrix.columns[i]
                    col2 = corr_matrix.columns[j]
                    corr_value = corr_matrix.iloc[i, j]
                    
                    if abs(corr_value) > 0.5 and not np.isnan(corr_value):
                        significant_correlations.append({
                            'column1': col1,
                            'column2': col2,
                            'correlation': float(corr_value),
                            'strength': self._interpret_correlation(abs(corr_value))
                        })
            
            # Sort by absolute correlation value
            significant_correlations.sort(key=lambda x: abs(x['correlation']), reverse=True)
            
            return {
                'success': True,
                'correlation_matrix': corr_matrix.to_dict(),
                'significant_correlations': significant_correlations,
                'method': method,
                'analyzed_columns': list(corr_matrix.columns)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def group_statistics(self, group_by: str, agg_columns: List[str], 
                        aggregations: List[str] = None) -> Dict[str, Any]:
        """
        Calculate grouped statistics
        
        Args:
            group_by: Column to group by
            agg_columns: Columns to aggregate
            aggregations: List of aggregation functions
            
        Returns:
            Dict containing grouped statistics
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
            
            if group_by not in self.data.columns:
                return {'success': False, 'error': f'Group column {group_by} not found'}
            
            missing_cols = [col for col in agg_columns if col not in self.data.columns]
            if missing_cols:
                return {'success': False, 'error': f'Columns not found: {missing_cols}'}
            
            if aggregations is None:
                aggregations = ['mean', 'median', 'std', 'min', 'max', 'count']
            
            # Filter numeric columns for numeric aggregations
            numeric_agg_cols = self.data[agg_columns].select_dtypes(include=[np.number]).columns.tolist()
            
            if not numeric_agg_cols:
                return {'success': False, 'error': 'No numeric columns found for aggregation'}
            
            # Calculate grouped statistics
            agg_dict = {}
            for agg_func in aggregations:
                if agg_func in ['mean', 'median', 'std', 'min', 'max']:
                    agg_dict[agg_func] = numeric_agg_cols
                elif agg_func == 'count':
                    agg_dict[agg_func] = agg_columns
                elif agg_func == 'nunique':
                    agg_dict[agg_func] = agg_columns
            
            grouped_stats = self.data.groupby(group_by).agg(agg_dict).reset_index()
            
            # Flatten multi-level columns if present
            if isinstance(grouped_stats.columns, pd.MultiIndex):
                grouped_stats.columns = ['_'.join(col).strip() if col[1] else col[0] for col in grouped_stats.columns.values]
            
            return {
                'success': True,
                'grouped_statistics': grouped_stats.to_dict('records'),
                'group_by': group_by,
                'aggregations': aggregations,
                'columns': list(grouped_stats.columns)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def outlier_detection(self, columns: List[str] = None, method: str = 'iqr') -> Dict[str, Any]:
        """
        Detect outliers in numeric columns
        
        Args:
            columns: List of columns to analyze (if None, analyze all numeric columns)
            method: Outlier detection method ('iqr', 'zscore', 'modified_zscore')
            
        Returns:
            Dict containing outlier information
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
            
            if columns:
                numeric_data = self.data[columns].select_dtypes(include=[np.number])
            else:
                numeric_data = self.data.select_dtypes(include=[np.number])
            
            if numeric_data.empty:
                return {'success': False, 'error': 'No numeric columns found'}
            
            outlier_info = {}
            
            for column in numeric_data.columns:
                col_data = numeric_data[column].dropna()
                
                if len(col_data) == 0:
                    continue
                
                outliers = []
                
                if method == 'iqr':
                    Q1 = col_data.quantile(0.25)
                    Q3 = col_data.quantile(0.75)
                    IQR = Q3 - Q1
                    lower_bound = Q1 - 1.5 * IQR
                    upper_bound = Q3 + 1.5 * IQR
                    outliers = col_data[(col_data < lower_bound) | (col_data > upper_bound)]
                    
                elif method == 'zscore':
                    z_scores = np.abs(stats.zscore(col_data))
                    outliers = col_data[z_scores > 3]
                    
                elif method == 'modified_zscore':
                    median = col_data.median()
                    mad = np.median(np.abs(col_data - median))
                    modified_z_scores = 0.6745 * (col_data - median) / mad
                    outliers = col_data[np.abs(modified_z_scores) > 3.5]
                
                outlier_indices = outliers.index.tolist()
                outlier_values = outliers.tolist()
                
                outlier_info[column] = {
                    'outlier_count': len(outliers),
                    'outlier_percentage': float((len(outliers) / len(col_data)) * 100),
                    'outlier_indices': outlier_indices,
                    'outlier_values': outlier_values,
                    'method': method
                }
            
            return {
                'success': True,
                'outlier_info': outlier_info,
                'method': method,
                'analyzed_columns': list(outlier_info.keys())
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def data_quality_report(self) -> Dict[str, Any]:
        """
        Generate comprehensive data quality report
        
        Returns:
            Dict containing data quality metrics
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
            
            report = {
                'dataset_info': {
                    'total_rows': len(self.data),
                    'total_columns': len(self.data.columns),
                    'memory_usage_mb': float(self.data.memory_usage(deep=True).sum() / (1024 * 1024))
                },
                'missing_data': {},
                'duplicate_data': {},
                'data_types': {},
                'column_quality': {}
            }
            
            # Missing data analysis
            missing_counts = self.data.isnull().sum()
            report['missing_data'] = {
                'total_missing': int(missing_counts.sum()),
                'missing_by_column': missing_counts.to_dict(),
                'columns_with_missing': missing_counts[missing_counts > 0].index.tolist(),
                'complete_rows': int(len(self.data) - self.data.isnull().any(axis=1).sum())
            }
            
            # Duplicate data analysis
            duplicate_rows = self.data.duplicated().sum()
            report['duplicate_data'] = {
                'duplicate_rows': int(duplicate_rows),
                'duplicate_percentage': float((duplicate_rows / len(self.data)) * 100)
            }
            
            # Data types analysis
            report['data_types'] = {
                'numeric_columns': list(self.data.select_dtypes(include=[np.number]).columns),
                'categorical_columns': list(self.data.select_dtypes(include=['object', 'category']).columns),
                'datetime_columns': list(self.data.select_dtypes(include=['datetime64']).columns),
                'boolean_columns': list(self.data.select_dtypes(include=['bool']).columns)
            }
            
            # Column-wise quality metrics
            for column in self.data.columns:
                col_data = self.data[column]
                unique_count = col_data.nunique()
                total_count = len(col_data)
                
                quality_metrics = {
                    'unique_count': int(unique_count),
                    'unique_percentage': float((unique_count / total_count) * 100),
                    'missing_count': int(col_data.isnull().sum()),
                    'missing_percentage': float((col_data.isnull().sum() / total_count) * 100),
                    'data_type': str(col_data.dtype)
                }
                
                # Add specific metrics based on data type
                if pd.api.types.is_numeric_dtype(col_data):
                    quality_metrics.update({
                        'mean': float(col_data.mean()) if not col_data.isnull().all() else None,
                        'std': float(col_data.std()) if not col_data.isnull().all() else None,
                        'min': float(col_data.min()) if not col_data.isnull().all() else None,
                        'max': float(col_data.max()) if not col_data.isnull().all() else None
                    })
                elif pd.api.types.is_string_dtype(col_data) or col_data.dtype == 'object':
                    quality_metrics.update({
                        'avg_length': float(col_data.astype(str).str.len().mean()),
                        'max_length': int(col_data.astype(str).str.len().max()),
                        'min_length': int(col_data.astype(str).str.len().min())
                    })
                
                report['column_quality'][column] = quality_metrics
            
            return {
                'success': True,
                'quality_report': report
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _interpret_correlation(self, corr_value: float) -> str:
        """
        Interpret correlation strength
        
        Args:
            corr_value: Absolute correlation value
            
        Returns:
            String describing correlation strength
        """
        if corr_value >= 0.9:
            return 'Very Strong'
        elif corr_value >= 0.7:
            return 'Strong'
        elif corr_value >= 0.5:
            return 'Moderate'
        elif corr_value >= 0.3:
            return 'Weak'
        else:
            return 'Very Weak'
