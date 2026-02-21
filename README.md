# Alchemist - Data Cleaning and Transformation Tool

Alchemist is a web-based data cleaning and transformation tool similar to OpenRefine, built with a Python Flask backend and a modern JavaScript frontend. Upload, clean, transform, visualize, and export datasets from CSV, Excel, JSON, and SQLite with session management and **case-insensitive** filtering and search.

---

## Features

### Data Upload & Management
- **Multiple format support**: CSV, Excel (.xlsx, .xls), JSON, and **SQLite** (.db, .sqlite, .sqlite3)
- **Drag & drop**: File upload with progress
- **Data preview**: Instant preview and metadata after upload
- **Session management**: Persistent sessions; **New Session** clears state and returns to upload screen

### Data Cleaning Operations
- **Remove duplicates**: Eliminate duplicate rows
- **Handle missing values**: Fill with mean, median, mode, or custom value
- **Outlier detection**: IQR, Z-score, or Modified Z-score
- **Data type conversion**: Convert column types
- **Text cleaning**: Trim whitespace, normalize case
- **Remove empty rows/columns**

### Table & Column Tools
- **Column header dropdown** (per column):
  - **Sort A→Z / Z→A**: Sort ascending or descending
  - **Filter**: Inline filter with operator (Equals, Not Equals, Greater Than, Less Than, Contains, Not Contains) and value
  - **Column statistics**: Jump to Statistics view for that column
- **Case-insensitive behavior**: All filters and table search are **case-insensitive** (e.g. "yes" matches "YES")
- **Table search**: Real-time search across all columns (case-insensitive)
- **Pagination**: Configurable rows per page

### Preview Operations
- **Preview before applying**: Run remove duplicates, remove empty rows, clean text (trim, normalize case) on a sample and compare **Original** vs **Preview**
- **Preview on current view**: If a filter is applied, preview runs on the **filtered data** so you see the effect on the subset you care about
- **Download preview data**: In the Preview Results modal you can download:
  - **Original** (before operations): CSV, Excel, JSON, TSV, HTML
  - **Preview** (after operations): CSV, Excel, JSON, TSV, HTML

### Export & Download
- **Download** (main button): Export full dataset from server (CSV, Excel, JSON, TSV, HTML, SQL)
- **Download current view**: Export the **current table** (filtered or full) as CSV, Excel, JSON, TSV, HTML, or SQL
- **Preview Results modal**: Download original or preview sample in CSV, Excel, JSON, TSV, HTML, or SQL

### Visualization & Analysis
- **Charts**: Histograms, scatter, bar, box, heatmap, line, pie (Plotly.js)
- **Statistics**: Descriptive, categorical, correlation, data quality, outlier detection
- **Undo / Redo**: Revert or reapply the last operation

### Other
- **Reset**: Restore dataset to last uploaded state
- **Case-insensitive operations**: Filter and search ignore letter case

---

## Project Structure

```
Alchemist/
├── backend/
│   ├── app.py              # Flask app and API
│   ├── requirements.txt
│   ├── modules/
│   │   ├── data_handler.py # Load, clean, filter, preview
│   │   ├── visualization.py
│   │   └── stats.py
│   └── utils/
│       └── helpers.py
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/                   # Uploads and session data
└── README.md
```

---

## Installation & Setup

### Prerequisites
- Python 3.8+
- pip
- Modern browser (Chrome, Firefox, Safari, Edge)

### Backend

1. Go to the backend directory:
   ```bash
   cd Alchemist/backend
   ```

2. (Optional) Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows: venv\Scripts\activate
   # macOS/Linux: source venv/bin/activate
   ```

3. Install dependencies and run:
   ```bash
   pip install -r requirements.txt
   python app.py
   ```

   Server runs at **http://localhost:5000**.

### Frontend

The Flask app serves the frontend. Open **http://localhost:5000** in your browser.

---

## Usage

### 1. Upload data
- Click **Select File** or drag and drop a CSV, Excel, JSON, or SQLite (.db) file.
- After processing, the workspace opens with the table view.

### 2. Work with the table
- **Sort**: Click a column name for A→Z, or open the column **▼** menu and choose Sort A→Z or Sort Z→A.
- **Filter**: Open the column **▼** menu → **Filter** → choose operator and value → **Apply**. Or use the sidebar filter and **Apply Filter**.
- **Search**: Type in the search box; matching is case-insensitive across all columns.
- **Download current view**: Click **Download current view**, pick format (CSV, Excel, JSON, TSV, HTML). This exports the currently visible data (filtered or full).

### 3. Preview operations
- Click **Preview** in the sidebar.
- Select operations (e.g. Remove Duplicates, Remove Empty Rows, Clean Text) and sample size.
- If you have a filter applied, the preview uses the **filtered** data.
- Click **Preview** in the modal to see Original vs Preview; use **Download** in that modal to export either side in multiple formats.

### 4. Apply cleaning and export
- Use **Remove Duplicates**, **Fill Missing**, **Clean Text**, etc. from the sidebar.
- Use **Download** for the full dataset, or **Download current view** for the current table.
- **New Session**: Clears state and shows the upload screen again (any unsaved work is lost after you confirm).

---

## API Overview

- `POST /api/upload` – Upload file, create session
- `GET /api/data/info` – Dataset info
- `POST /api/download` – Export full data (CSV/Excel/JSON)
- `POST /api/clean` – Cleaning operations
- `POST /api/filter` – Apply filters (case-insensitive)
- `POST /api/preview` – Preview operations (optional `data` = current filtered rows)
- `POST /api/undo`, `POST /api/redo`, `POST /api/reset`
- `GET /api/stats`, `POST /api/visualize`, etc.

---

## Behaviour Notes

- **Case-insensitive**: Filter (equals, not equals, contains, not contains) and table search ignore case.
- **New Session**: Resets app state, clears table and filters, shows upload; next upload gets a new session.
- **Preview on filter**: When you run Preview with an active filter, the sample is taken from the filtered data.

---

## Troubleshooting

- **Upload fails**: Use CSV, Excel, JSON, or SQLite (.db); check file size and that the file isn’t corrupted.
- **Charts not showing**: Check console for errors; ensure Plotly loads and data has suitable columns.
- **Slow with large data**: Use filters or reduce rows per page.

---

## License

MIT License.

---

**Alchemist** – Clean, transform, and export your data with case-insensitive filters and flexible preview and download options.
