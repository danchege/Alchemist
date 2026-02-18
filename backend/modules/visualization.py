"""
Visualization Module for Alchemist

This module provides functions for generating various types of charts and visualizations
from datasets. Supports multiple chart types and returns data in formats suitable for
web display (JSON for interactive charts, base64 images for static charts).
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.graph_objects as go
import plotly.express as px
from plotly.utils import PlotlyJSONEncoder
import json
import base64
import io
from typing import Dict, List, Any, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')

# Set matplotlib to use Agg backend for non-interactive plotting
plt.switch_backend('Agg')

# Set style for better looking plots
plt.style.use('seaborn-v0_8')
sns.set_palette("husl")


class Visualizer:
    """Main class for data visualization operations"""
    
    def __init__(self):
        self.data = None
        
    def set_data(self, data: pd.DataFrame):
        """
        Set the data for visualization
        
        Args:
            data: pandas DataFrame to visualize
        """
        self.data = data
        
    def create_histogram(self, column: str, bins: int = 30, title: str = None) -> Dict[str, Any]:
        """
        Create a histogram for numerical data
        
        Args:
            column: Column name to plot
            bins: Number of bins for histogram
            title: Optional title for the plot
            
        Returns:
            Dict containing plot data and metadata
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
                
            if column not in self.data.columns:
                return {'success': False, 'error': f'Column {column} not found'}
                
            if not pd.api.types.is_numeric_dtype(self.data[column]):
                return {'success': False, 'error': f'Column {column} is not numeric'}
            
            # Create Plotly histogram
            fig = px.histogram(
                self.data, 
                x=column, 
                nbins=bins,
                title=title or f'Histogram of {column}',
                labels={column: column, 'count': 'Frequency'}
            )
            
            fig.update_layout(
                showlegend=False,
                height=400
            )
            
            plot_json = json.dumps(fig, cls=PlotlyJSONEncoder)
            
            return {
                'success': True,
                'plot_data': plot_json,
                'plot_type': 'histogram',
                'column': column,
                'title': title or f'Histogram of {column}'
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def create_scatter_plot(self, x_column: str, y_column: str, 
                           color_column: str = None, size_column: str = None,
                           title: str = None) -> Dict[str, Any]:
        """
        Create a scatter plot
        
        Args:
            x_column: Column name for x-axis
            y_column: Column name for y-axis
            color_column: Optional column for color coding
            size_column: Optional column for size coding
            title: Optional title for the plot
            
        Returns:
            Dict containing plot data and metadata
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
                
            missing_cols = [col for col in [x_column, y_column] if col not in self.data.columns]
            if missing_cols:
                return {'success': False, 'error': f'Columns not found: {missing_cols}'}
            
            # Prepare scatter plot data
            plot_data = {
                'x': self.data[x_column].tolist(),
                'y': self.data[y_column].tolist(),
                'mode': 'markers',
                'type': 'scatter',
                'name': f'{y_column} vs {x_column}'
            }
            
            if color_column and color_column in self.data.columns:
                plot_data['marker'] = {'color': self.data[color_column].tolist()}
                
            if size_column and size_column in self.data.columns:
                if 'marker' not in plot_data:
                    plot_data['marker'] = {}
                plot_data['marker']['size'] = self.data[size_column].tolist()
            
            # Create Plotly figure
            fig = go.Figure([plot_data])
            
            fig.update_layout(
                title=title or f'{y_column} vs {x_column}',
                xaxis_title=x_column,
                yaxis_title=y_column,
                height=400
            )
            
            plot_json = json.dumps(fig, cls=PlotlyJSONEncoder)
            
            return {
                'success': True,
                'plot_data': plot_json,
                'plot_type': 'scatter',
                'x_column': x_column,
                'y_column': y_column,
                'title': title or f'{y_column} vs {x_column}'
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def create_bar_chart(self, column: str, title: str = None, top_n: int = None) -> Dict[str, Any]:
        """
        Create a bar chart for categorical data
        
        Args:
            column: Column name to plot
            title: Optional title for the plot
            top_n: Optional limit to top N categories
            
        Returns:
            Dict containing plot data and metadata
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
                
            if column not in self.data.columns:
                return {'success': False, 'error': f'Column {column} not found'}
            
            # Count values
            value_counts = self.data[column].value_counts()
            
            if top_n:
                value_counts = value_counts.head(top_n)
            
            # Create Plotly bar chart
            fig = px.bar(
                x=value_counts.index,
                y=value_counts.values,
                title=title or f'Bar Chart of {column}',
                labels={'x': column, 'y': 'Count'}
            )
            
            fig.update_layout(
                height=400,
                xaxis_title=column,
                yaxis_title='Count'
            )
            
            plot_json = json.dumps(fig, cls=PlotlyJSONEncoder)
            
            return {
                'success': True,
                'plot_data': plot_json,
                'plot_type': 'bar',
                'column': column,
                'title': title or f'Bar Chart of {column}',
                'categories': len(value_counts)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def create_box_plot(self, column: str, group_by: str = None, title: str = None) -> Dict[str, Any]:
        """
        Create a box plot for numerical data
        
        Args:
            column: Column name to plot
            group_by: Optional column to group by
            title: Optional title for the plot
            
        Returns:
            Dict containing plot data and metadata
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
                
            if column not in self.data.columns:
                return {'success': False, 'error': f'Column {column} not found'}
                
            if not pd.api.types.is_numeric_dtype(self.data[column]):
                return {'success': False, 'error': f'Column {column} is not numeric'}
            
            # Create Plotly box plot
            if group_by and group_by in self.data.columns:
                fig = px.box(
                    self.data, 
                    x=group_by, 
                    y=column,
                    title=title or f'Box Plot of {column} by {group_by}'
                )
            else:
                fig = px.box(
                    self.data, 
                    y=column,
                    title=title or f'Box Plot of {column}'
                )
            
            fig.update_layout(height=400)
            
            plot_json = json.dumps(fig, cls=PlotlyJSONEncoder)
            
            return {
                'success': True,
                'plot_data': plot_json,
                'plot_type': 'box',
                'column': column,
                'group_by': group_by,
                'title': title or f'Box Plot of {column}'
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def create_heatmap(self, columns: List[str] = None, title: str = None) -> Dict[str, Any]:
        """
        Create a correlation heatmap
        
        Args:
            columns: List of columns to include (if None, use all numeric columns)
            title: Optional title for the plot
            
        Returns:
            Dict containing plot data and metadata
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
            
            # Select numeric columns
            if columns:
                numeric_data = self.data[columns].select_dtypes(include=[np.number])
            else:
                numeric_data = self.data.select_dtypes(include=[np.number])
            
            if numeric_data.empty:
                return {'success': False, 'error': 'No numeric columns found for correlation'}
            
            # Calculate correlation matrix
            corr_matrix = numeric_data.corr()
            
            # Create Plotly heatmap
            fig = px.imshow(
                corr_matrix,
                title=title or 'Correlation Heatmap',
                color_continuous_scale='RdBu',
                aspect='auto'
            )
            
            fig.update_layout(height=500)
            
            plot_json = json.dumps(fig, cls=PlotlyJSONEncoder)
            
            return {
                'success': True,
                'plot_data': plot_json,
                'plot_type': 'heatmap',
                'columns': list(corr_matrix.columns),
                'title': title or 'Correlation Heatmap'
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def create_line_plot(self, x_column: str, y_columns: List[str], 
                        title: str = None) -> Dict[str, Any]:
        """
        Create a line plot
        
        Args:
            x_column: Column name for x-axis
            y_columns: List of column names for y-axis
            title: Optional title for the plot
            
        Returns:
            Dict containing plot data and metadata
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
                
            required_cols = [x_column] + y_columns
            missing_cols = [col for col in required_cols if col not in self.data.columns]
            if missing_cols:
                return {'success': False, 'error': f'Columns not found: {missing_cols}'}
            
            # Create Plotly line plot
            fig = go.Figure()
            
            for y_col in y_columns:
                fig.add_trace(go.Scatter(
                    x=self.data[x_column],
                    y=self.data[y_col],
                    mode='lines+markers',
                    name=y_col
                ))
            
            fig.update_layout(
                title=title or f'Line Plot',
                xaxis_title=x_column,
                yaxis_title='Value',
                height=400
            )
            
            plot_json = json.dumps(fig, cls=PlotlyJSONEncoder)
            
            return {
                'success': True,
                'plot_data': plot_json,
                'plot_type': 'line',
                'x_column': x_column,
                'y_columns': y_columns,
                'title': title or 'Line Plot'
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def create_pie_chart(self, column: str, title: str = None, top_n: int = 10) -> Dict[str, Any]:
        """
        Create a pie chart for categorical data
        
        Args:
            column: Column name to plot
            title: Optional title for the plot
            top_n: Limit to top N categories
            
        Returns:
            Dict containing plot data and metadata
        """
        try:
            if self.data is None:
                return {'success': False, 'error': 'No data set'}
                
            if column not in self.data.columns:
                return {'success': False, 'error': f'Column {column} not found'}
            
            # Count values and limit to top N
            value_counts = self.data[column].value_counts().head(top_n)
            
            # Create Plotly pie chart
            fig = px.pie(
                values=value_counts.values,
                names=value_counts.index,
                title=title or f'Pie Chart of {column}'
            )
            
            fig.update_layout(height=400)
            
            plot_json = json.dumps(fig, cls=PlotlyJSONEncoder)
            
            return {
                'success': True,
                'plot_data': plot_json,
                'plot_type': 'pie',
                'column': column,
                'title': title or f'Pie Chart of {column}',
                'categories': len(value_counts)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_available_plots(self) -> Dict[str, Any]:
        """
        Get information about available plot types based on data
        
        Returns:
            Dict containing available plot options
        """
        if self.data is None:
            return {'success': False, 'error': 'No data set'}
        
        try:
            numeric_columns = list(self.data.select_dtypes(include=[np.number]).columns)
            categorical_columns = list(self.data.select_dtypes(include=['object', 'category']).columns)
            datetime_columns = list(self.data.select_dtypes(include=['datetime64']).columns)
            
            available_plots = {
                'histogram': numeric_columns,
                'scatter': numeric_columns,
                'bar': categorical_columns,
                'box': numeric_columns,
                'heatmap': numeric_columns if len(numeric_columns) > 1 else [],
                'line': numeric_columns + datetime_columns,
                'pie': categorical_columns
            }
            
            return {
                'success': True,
                'available_plots': available_plots,
                'numeric_columns': numeric_columns,
                'categorical_columns': categorical_columns,
                'datetime_columns': datetime_columns
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
