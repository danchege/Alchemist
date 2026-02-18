# Alchemist - Data Cleaning and Transformation Tool

Alchemist is a web-based data cleaning and transformation tool similar to OpenRefine, built with Python Flask backend and modern JavaScript frontend. It allows users to upload, clean, transform, visualize, and export datasets from CSV, Excel, and JSON formats.

## Features

### Data Upload & Management
- **Multiple Format Support**: Upload CSV, Excel (.xlsx, .xls), and JSON files
- **Drag & Drop Interface**: Intuitive file upload with progress tracking
- **Data Preview**: Instant preview of uploaded datasets with metadata
- **Session Management**: Persistent sessions to save work progress

### Data Cleaning Operations
- **Remove Duplicates**: Eliminate duplicate rows from datasets
- **Handle Missing Values**: Fill missing data using mean, median, mode, or custom values
- **Outlier Detection**: Identify and remove outliers using IQR, Z-score, or Modified Z-score methods
- **Data Type Conversion**: Convert columns between different data types
- **Data Validation**: Comprehensive data quality checks and reports

### Data Transformation
- **Filtering**: Apply complex filters with multiple operators (equals, contains, greater than, etc.)
- **Column Operations**: Create, rename, drop, and transform columns
- **Sorting**: Sort data by single or multiple columns
- **Grouping & Aggregation**: Group data and calculate aggregations

### Visualization & Analysis
- **Interactive Charts**: Create histograms, scatter plots, bar charts, box plots, heatmaps, line plots, and pie charts
- **Statistical Analysis**: Descriptive statistics, correlation analysis, categorical statistics
- **Data Quality Reports**: Comprehensive reports on data completeness and quality
- **Real-time Updates**: Visualizations update automatically with data changes

### Export & Download
- **Multiple Formats**: Export cleaned data as CSV, Excel, or JSON
- **Custom Filenames**: Choose custom filenames for exported files
- **Preserve Formatting**: Maintain data integrity during export

## Project Structure

```
data_refine_tool_web/
│
├── backend/                 # Python backend (Flask)
│   ├── app.py              # Main Flask application with API endpoints
│   ├── requirements.txt    # Python dependencies
│   ├── modules/            # Core functionality modules
│   │   ├── data_handler.py    # Data loading, cleaning, and transformation
│   │   ├── visualization.py   # Chart generation and visualization
│   │   └── stats.py           # Statistical analysis and reporting
│   └── utils/              # Utility functions
│       └── helpers.py          # File handling, validation, and helper functions
│
├── frontend/               # Web interface
│   ├── index.html         # Main HTML page
│   ├── styles.css         # CSS styling
│   ├── app.js            # JavaScript application logic
│   └── libs/             # External libraries (Plotly.js)
│
├── data/                  # Temporary storage for uploaded files
└── README.md             # This documentation
```

## Installation & Setup

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd data_refine_tool_web/backend
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python -m venv venv
   
   # On Windows:
   venv\Scripts\activate
   
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the Flask server:**
   ```bash
   python app.py
   ```

   The server will start on `http://localhost:5000`

### Frontend Setup

The frontend is served directly by the Flask application, so no additional setup is required. Simply open your web browser and navigate to `http://localhost:5000`.

## Usage Guide

### 1. Upload Data
- Click "Select File" or drag and drop a CSV, Excel, or JSON file
- Wait for the file to process and preview
- The workspace will automatically open with your data loaded

### 2. Explore Data
- **Table View**: Browse your data in a sortable, searchable table
- **Statistics View**: View descriptive statistics and data quality metrics
- Use the search bar to filter data in real-time
- Adjust rows per page for better navigation

### 3. Clean Data
- **Remove Duplicates**: Click "Remove Duplicates" to eliminate duplicate rows
- **Fill Missing Values**: Choose a column and method to handle missing data
- **Remove Outliers**: Detect and remove statistical outliers
- **Convert Types**: Change data types for proper analysis

### 4. Transform Data
- **Apply Filters**: Use the filter panel to subset your data
- **Create Visualizations**: Select plot types and parameters to generate charts
- **Statistical Analysis**: Access various statistical analyses from the sidebar

### 5. Export Results
- Click "Download" to export your cleaned data
- Choose from CSV, Excel, or JSON formats
- Specify custom filenames if desired

## API Endpoints

The backend provides RESTful API endpoints for all operations:

### Data Management
- `POST /api/upload` - Upload and process data files
- `GET /api/data/info` - Get current dataset information
- `POST /api/download` - Export processed data

### Data Operations
- `POST /api/clean` - Perform data cleaning operations
- `POST /api/filter` - Apply filters to data
- `POST /api/transform` - Apply data transformations

### Analysis & Visualization
- `POST /api/visualize` - Create data visualizations
- `GET /api/stats` - Get statistical analysis
- `GET /api/plots/available` - Get available plot types

### Session Management
- `GET /api/session/<session_id>` - Get session information

## Data Processing Capabilities

### Supported File Formats
- **CSV**: Comma-separated values with automatic delimiter detection
- **Excel**: .xlsx and .xls files with multiple sheet support
- **JSON**: Nested and flat JSON structures

### Data Types Handled
- Numeric (integers, floats)
- Text/Strings
- Dates and timestamps
- Boolean values
- Categorical data

### Cleaning Operations
- Duplicate detection and removal
- Missing value imputation (mean, median, mode, custom)
- Outlier detection (IQR, Z-score, Modified Z-score)
- Data type conversion and validation
- Text cleaning and normalization

### Statistical Analyses
- Descriptive statistics (mean, median, std, quartiles)
- Correlation analysis (Pearson, Spearman, Kendall)
- Categorical frequency analysis
- Data quality assessment
- Outlier detection and reporting

## Browser Compatibility

Alchemist supports all modern web browsers:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Considerations

- **File Size Limit**: Maximum file size is 100MB by default
- **Memory Usage**: Large datasets are processed in chunks when possible
- **Session Storage**: Session data is stored locally and on the server
- **Caching**: Frequently accessed data is cached for better performance

## Troubleshooting

### Common Issues

1. **File Upload Fails**
   - Check file format (CSV, Excel, JSON only)
   - Ensure file size is under 100MB
   - Verify file is not corrupted

2. **Visualizations Not Displaying**
   - Check browser console for JavaScript errors
   - Ensure Plotly.js library loads correctly
   - Verify data contains valid numeric/categorical columns

3. **Slow Performance**
   - Reduce dataset size through filtering
   - Use fewer rows per page in table view
   - Close unnecessary browser tabs

4. **Memory Errors**
   - Restart the Flask server
   - Clear browser cache
   - Use smaller datasets for testing

### Error Messages
- **"Unsupported file type"**: Upload only CSV, Excel, or JSON files
- **"File too large"**: Reduce file size under 100MB
- **"No numeric columns found"**: Ensure dataset contains numeric data for statistical operations

## Development

### Adding New Features
1. Backend: Add new functions to appropriate modules (`data_handler.py`, `visualization.py`, `stats.py`)
2. Frontend: Update `app.js` with new UI logic and API calls
3. Styling: Modify `styles.css` for visual changes
4. API: Add new endpoints to `app.py`

### Testing
- Test with various file formats and sizes
- Verify all cleaning operations work correctly
- Check visualizations render properly
- Ensure export functionality maintains data integrity

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request with detailed description

## License

This project is open source and available under the MIT License.

## Support

For issues, questions, or feature requests:
1. Check the troubleshooting section above
2. Review the API documentation
3. Create an issue in the project repository
4. Contact the development team

---

**Alchemist** - Transform your raw data into insights with powerful data cleaning and visualization tools.
