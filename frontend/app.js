/**
 * Alchemist - Data Cleaning Tool Frontend Application
 * Main JavaScript application for data upload, cleaning, and visualization
 */

class AlchemistApp {
    constructor() {
        this.apiBase = '/api';
        this.currentData = null;
        this.currentSession = null;
        this.currentView = 'table';
        this.filteredData = null;
        this.currentPage = 1;
        this.rowsPerPage = 10;
        this.searchTerm = '';
        
        this.initializeEventListeners();
        this.loadSessionFromStorage();
    }

    initializeEventListeners() {
        // File upload
        const fileInput = document.getElementById('fileInput');
        const selectFileBtn = document.getElementById('selectFileBtn');
        const uploadArea = document.getElementById('uploadArea');

        selectFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });

        // Navigation
        document.getElementById('tableViewBtn').addEventListener('click', () => this.switchView('table'));
        document.getElementById('statsViewBtn').addEventListener('click', () => this.switchView('stats'));

        // Data operations
        document.getElementById('removeDuplicatesBtn').addEventListener('click', () => this.removeDuplicates());
        document.getElementById('fillMissingBtn').addEventListener('click', () => this.showFillMissingModal());
        document.getElementById('removeOutliersBtn').addEventListener('click', () => this.removeOutliers());
        document.getElementById('convertTypesBtn').addEventListener('click', () => this.showConvertTypesModal());

        // Filters
        document.getElementById('applyFilterBtn').addEventListener('click', () => this.applyFilter());
        document.getElementById('clearFiltersBtn').addEventListener('click', () => this.clearFilters());

        // Visualizations
        document.getElementById('plotType').addEventListener('change', () => this.updatePlotParameters());
        document.getElementById('createPlotBtn').addEventListener('click', () => this.createPlot());

        // Table controls
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.currentPage = 1;
            this.renderTable();
        });

        document.getElementById('rowsPerPage').addEventListener('change', (e) => {
            this.rowsPerPage = parseInt(e.target.value);
            this.currentPage = 1;
            this.renderTable();
        });

        // Statistics
        document.getElementById('loadStatsBtn').addEventListener('click', () => this.loadStatistics());

        // Workspace actions
        document.getElementById('downloadBtn').addEventListener('click', () => this.showDownloadModal());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetData());

        // Session management
        document.getElementById('newSessionBtn').addEventListener('click', () => this.newSession());

        // Modal
        document.getElementById('closeModalBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'modalOverlay') {
                this.closeModal();
            }
        });
    }

    async handleFileSelect(file) {
        if (!file) return;

        const validTypes = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/json'];
        const validExtensions = ['.csv', '.xlsx', '.xls', '.json'];
        
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExtensions.includes(fileExtension)) {
            this.showNotification('Please upload a CSV, Excel, or JSON file', 'error');
            return;
        }

        this.showLoading(true);
        const uploadProgress = document.getElementById('uploadProgress');
        const uploadArea = document.getElementById('uploadArea');
        
        uploadProgress.classList.remove('hidden');
        uploadArea.classList.add('hidden');

        try {
            const formData = new FormData();
            formData.append('file', file);
            if (this.currentSession) {
                formData.append('session_id', this.currentSession);
            }

            console.log('Starting file upload:', file.name, 'Size:', file.size, 'bytes');

            // Add timeout handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

            const response = await fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            console.log('Upload response received:', response.status, response.statusText);

            // Handle response - read as text first, then parse JSON if possible
            let result;
            const contentType = response.headers.get('content-type') || '';
            const responseText = await response.text();
            
            if (contentType.includes('application/json')) {
                try {
                    result = JSON.parse(responseText);
                } catch (jsonError) {
                    console.error('JSON parse error:', jsonError);
                    console.error('Response text:', responseText);
                    throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`);
                }
            } else {
                // Not JSON response - use text as error message
                console.error('Non-JSON response:', responseText);
                throw new Error(`Server error (${response.status}): ${responseText.substring(0, 200)}`);
            }

            // Log the result for debugging
            if (!result.success) {
                console.error('Upload failed:', result);
                if (result.traceback) {
                    console.error('Server traceback:', result.traceback);
                }
            }

            if (result.success) {
                this.currentData = result.data_info.data;
                this.currentSession = result.session_id;
                this.filteredData = null;
                
                this.saveSessionToStorage();
                this.showWorkspace(result);
                this.showNotification('File uploaded successfully!', 'success');
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            let errorMessage = error.message || 'Upload failed';
            
            // Handle timeout
            if (error.name === 'AbortError') {
                errorMessage = 'Upload timeout - file may be too large or server is not responding';
            } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                errorMessage = 'Failed to connect to server. Please check if the server is running.';
            }
            
            // Error message should already contain the server error if it was a response error
            this.showNotification(`Upload failed: ${errorMessage}`, 'error');
            uploadProgress.classList.add('hidden');
            uploadArea.classList.remove('hidden');
        } finally {
            this.showLoading(false);
        }
    }

    showWorkspace(data) {
        document.getElementById('uploadSection').classList.add('hidden');
        document.getElementById('workspaceSection').classList.remove('hidden');

        // Update dataset info
        document.getElementById('datasetTitle').textContent = data.data_info.filename || 'Dataset';
        document.getElementById('datasetSize').textContent = `${data.data_info.shape[0].toLocaleString()} rows × ${data.data_info.shape[1]} columns`;

        // Update column selectors
        this.updateColumnSelectors(data.data_info.columns);

        // Show table view
        this.switchView('table');
        this.renderTable();
    }

    updateColumnSelectors(columns) {
        const filterColumn = document.getElementById('filterColumn');
        filterColumn.innerHTML = '<option value="">Select column...</option>';
        
        columns.forEach(column => {
            const option = document.createElement('option');
            option.value = column;
            option.textContent = column;
            filterColumn.appendChild(option);
        });
    }

    switchView(view) {
        // Hide all views
        document.getElementById('tableView').classList.add('hidden');
        document.getElementById('statsView').classList.add('hidden');
        document.getElementById('vizView').classList.add('hidden');

        // Show selected view
        document.getElementById(`${view}View`).classList.remove('hidden');

        // Update button states
        document.getElementById('tableViewBtn').className = view === 'table' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
        document.getElementById('statsViewBtn').className = view === 'stats' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';

        this.currentView = view;

        // Load data for view
        if (view === 'stats') {
            this.loadStatistics();
        }
    }

    renderTable() {
        const data = this.filteredData || this.currentData;
        if (!data || data.length === 0) return;

        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        const tableInfo = document.getElementById('tableInfo');

        // Clear existing content
        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';

        // Create header
        const headerRow = document.createElement('tr');
        Object.keys(data[0]).forEach(column => {
            const th = document.createElement('th');
            th.textContent = column;
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => this.sortTable(column));
            headerRow.appendChild(th);
        });
        tableHeader.appendChild(headerRow);

        // Filter data based on search
        let filteredData = data;
        if (this.searchTerm) {
            filteredData = data.filter(row => 
                Object.values(row).some(value => 
                    String(value).toLowerCase().includes(this.searchTerm.toLowerCase())
                )
            );
        }

        // Pagination
        const startIndex = (this.currentPage - 1) * this.rowsPerPage;
        const endIndex = startIndex + this.rowsPerPage;
        const paginatedData = filteredData.slice(startIndex, endIndex);

        // Create body rows
        paginatedData.forEach(row => {
            const tr = document.createElement('tr');
            Object.values(row).forEach(value => {
                const td = document.createElement('td');
                td.textContent = value !== null ? String(value) : '';
                td.title = value !== null ? String(value) : '';
                tr.appendChild(td);
            });
            tableBody.appendChild(tr);
        });

        // Update info
        tableInfo.textContent = `Showing ${startIndex + 1}-${Math.min(endIndex, filteredData.length)} of ${filteredData.length} rows`;

        // Update pagination
        this.updatePagination(filteredData.length);
    }

    updatePagination(totalRows) {
        const pagination = document.getElementById('tablePagination');
        pagination.innerHTML = '';

        const totalPages = Math.ceil(totalRows / this.rowsPerPage);
        
        if (totalPages <= 1) return;

        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.textContent = 'Previous';
        prevBtn.className = 'btn btn-sm btn-secondary';
        prevBtn.disabled = this.currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderTable();
            }
        });
        pagination.appendChild(prevBtn);

        // Page info
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
        pageInfo.style.margin = '0 1rem';
        pagination.appendChild(pageInfo);

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next';
        nextBtn.className = 'btn btn-sm btn-secondary';
        nextBtn.disabled = this.currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderTable();
            }
        });
        pagination.appendChild(nextBtn);
    }

    sortTable(column) {
        const data = this.filteredData || this.currentData;
        if (!data) return;

        data.sort((a, b) => {
            const aVal = a[column];
            const bVal = b[column];
            
            if (aVal === null) return 1;
            if (bVal === null) return -1;
            
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return aVal - bVal;
            }
            
            return String(aVal).localeCompare(String(bVal));
        });

        this.renderTable();
    }

    async removeDuplicates() {
        try {
            this.showLoading(true);
            
            const response = await fetch(`${this.apiBase}/clean`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSession,
                    operations: [{ type: 'remove_duplicates' }]
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.filteredData = null;
                this.renderTable();
                this.showNotification('Duplicates removed successfully', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to remove duplicates: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showFillMissingModal() {
        const modalBody = document.getElementById('modalBody');
        const columns = this.currentData ? Object.keys(this.currentData[0]) : [];

        modalBody.innerHTML = `
            <div class="form-group">
                <label for="fillColumn">Column:</label>
                <select id="fillColumn" class="form-control">
                    ${columns.map(col => `<option value="${col}">${col}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="fillMethod">Method:</label>
                <select id="fillMethod" class="form-control">
                    <option value="mean">Mean</option>
                    <option value="median">Median</option>
                    <option value="mode">Mode</option>
                    <option value="zero">Zero</option>
                    <option value="custom">Custom Value</option>
                </select>
            </div>
            <div class="form-group" id="customValueGroup" style="display: none;">
                <label for="customValue">Custom Value:</label>
                <input type="text" id="customValue" class="form-control" placeholder="Enter value...">
            </div>
        `;

        document.getElementById('fillMethod').addEventListener('change', (e) => {
            document.getElementById('customValueGroup').style.display = 
                e.target.value === 'custom' ? 'block' : 'none';
        });

        this.showModal('Fill Missing Values', () => this.fillMissing());
    }

    async fillMissing() {
        try {
            const column = document.getElementById('fillColumn').value;
            const method = document.getElementById('fillMethod').value;
            let value = null;

            if (method === 'zero') {
                value = 0;
            } else if (method === 'custom') {
                value = document.getElementById('customValue').value;
            }

            this.showLoading(true);

            const response = await fetch(`${this.apiBase}/clean`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSession,
                    operations: [{
                        type: 'fill_missing',
                        column: column,
                        method: method === 'custom' ? 'value' : method,
                        value: value
                    }]
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.filteredData = null;
                this.renderTable();
                this.showNotification('Missing values filled successfully', 'success');
                this.closeModal();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to fill missing values: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async removeOutliers() {
        // Get numeric columns
        const numericColumns = this.getNumericColumns();
        
        if (numericColumns.length === 0) {
            this.showNotification('No numeric columns found for outlier detection', 'warning');
            return;
        }

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div class="form-group">
                <label for="outlierColumn">Column:</label>
                <select id="outlierColumn" class="form-control">
                    ${numericColumns.map(col => `<option value="${col}">${col}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="outlierMethod">Method:</label>
                <select id="outlierMethod" class="form-control">
                    <option value="iqr">IQR Method</option>
                    <option value="zscore">Z-Score Method</option>
                    <option value="modified_zscore">Modified Z-Score Method</option>
                </select>
            </div>
        `;

        this.showModal('Remove Outliers', () => this.removeOutliersAction());
    }

    async removeOutliersAction() {
        try {
            const column = document.getElementById('outlierColumn').value;
            const method = document.getElementById('outlierMethod').value;

            this.showLoading(true);

            const response = await fetch(`${this.apiBase}/clean`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSession,
                    operations: [{
                        type: 'remove_outliers',
                        column: column,
                        method: method
                    }]
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.filteredData = null;
                this.renderTable();
                this.showNotification('Outliers removed successfully', 'success');
                this.closeModal();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to remove outliers: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async applyFilter() {
        const column = document.getElementById('filterColumn').value;
        const operator = document.getElementById('filterOperator').value;
        const value = document.getElementById('filterValue').value;

        if (!column || !value) {
            this.showNotification('Please select column and enter filter value', 'warning');
            return;
        }

        try {
            this.showLoading(true);

            const response = await fetch(`${this.apiBase}/filter`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filters: [{
                        column: column,
                        operator: operator,
                        value: value
                    }]
                })
            });

            const result = await response.json();

            if (result.success) {
                this.filteredData = result.data;
                this.currentPage = 1;
                this.renderTable();
                this.showNotification('Filter applied successfully', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to apply filter: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    clearFilters() {
        this.filteredData = null;
        this.currentPage = 1;
        document.getElementById('filterColumn').value = '';
        document.getElementById('filterOperator').value = 'equals';
        document.getElementById('filterValue').value = '';
        this.renderTable();
        this.showNotification('Filters cleared', 'info');
    }

    updatePlotParameters() {
        const plotType = document.getElementById('plotType').value;
        const parametersContainer = document.getElementById('plotParameters');
        
        if (!plotType) {
            parametersContainer.innerHTML = '';
            return;
        }

        const columns = this.currentData ? Object.keys(this.currentData[0]) : [];
        const numericColumns = this.getNumericColumns();

        let parametersHTML = '';

        switch (plotType) {
            case 'histogram':
                parametersHTML = `
                    <div class="form-group">
                        <label for="histColumn">Column:</label>
                        <select id="histColumn" class="form-control">
                            ${numericColumns.map(col => `<option value="${col}">${col}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="histBins">Bins:</label>
                        <input type="number" id="histBins" class="form-control" value="30" min="5" max="100">
                    </div>
                `;
                break;
            case 'scatter':
                parametersHTML = `
                    <div class="form-group">
                        <label for="scatterX">X Column:</label>
                        <select id="scatterX" class="form-control">
                            ${numericColumns.map(col => `<option value="${col}">${col}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="scatterY">Y Column:</label>
                        <select id="scatterY" class="form-control">
                            ${numericColumns.map(col => `<option value="${col}">${col}</option>`).join('')}
                        </select>
                    </div>
                `;
                break;
            case 'bar':
                parametersHTML = `
                    <div class="form-group">
                        <label for="barColumn">Column:</label>
                        <select id="barColumn" class="form-control">
                            ${columns.map(col => `<option value="${col}">${col}</option>`).join('')}
                        </select>
                    </div>
                `;
                break;
            case 'box':
                parametersHTML = `
                    <div class="form-group">
                        <label for="boxColumn">Column:</label>
                        <select id="boxColumn" class="form-control">
                            ${numericColumns.map(col => `<option value="${col}">${col}</option>`).join('')}
                        </select>
                    </div>
                `;
                break;
            case 'heatmap':
                parametersHTML = `
                    <div class="form-group">
                        <label for="heatmapColumns">Columns (comma-separated):</label>
                        <input type="text" id="heatmapColumns" class="form-control" 
                               placeholder="${numericColumns.slice(0, 5).join(', ')}">
                    </div>
                `;
                break;
            case 'line':
                parametersHTML = `
                    <div class="form-group">
                        <label for="lineX">X Column:</label>
                        <select id="lineX" class="form-control">
                            ${columns.map(col => `<option value="${col}">${col}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="lineY">Y Columns (comma-separated):</label>
                        <input type="text" id="lineY" class="form-control" 
                               placeholder="${numericColumns.slice(0, 3).join(', ')}">
                    </div>
                `;
                break;
            case 'pie':
                parametersHTML = `
                    <div class="form-group">
                        <label for="pieColumn">Column:</label>
                        <select id="pieColumn" class="form-control">
                            ${columns.map(col => `<option value="${col}">${col}</option>`).join('')}
                        </select>
                    </div>
                `;
                break;
        }

        parametersContainer.innerHTML = parametersHTML;
    }

    async createPlot() {
        const plotType = document.getElementById('plotType').value;
        if (!plotType) {
            this.showNotification('Please select a plot type', 'warning');
            return;
        }

        let parameters = {};

        switch (plotType) {
            case 'histogram':
                parameters = {
                    column: document.getElementById('histColumn').value,
                    bins: parseInt(document.getElementById('histBins').value)
                };
                break;
            case 'scatter':
                parameters = {
                    x_column: document.getElementById('scatterX').value,
                    y_column: document.getElementById('scatterY').value
                };
                break;
            case 'bar':
                parameters = {
                    column: document.getElementById('barColumn').value
                };
                break;
            case 'box':
                parameters = {
                    column: document.getElementById('boxColumn').value
                };
                break;
            case 'heatmap':
                const heatmapCols = document.getElementById('heatmapColumns').value;
                parameters = {
                    columns: heatmapCols ? heatmapCols.split(',').map(c => c.trim()) : null
                };
                break;
            case 'line':
                const lineYCols = document.getElementById('lineY').value;
                parameters = {
                    x_column: document.getElementById('lineX').value,
                    y_columns: lineYCols ? lineYCols.split(',').map(c => c.trim()) : []
                };
                break;
            case 'pie':
                parameters = {
                    column: document.getElementById('pieColumn').value
                };
                break;
        }

        try {
            this.showLoading(true);

            const response = await fetch(`${this.apiBase}/visualize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    plot_type: plotType,
                    parameters: parameters
                })
            });

            const result = await response.json();

            if (result.success) {
                this.switchView('viz');
                const plotData = JSON.parse(result.plot_data);
                Plotly.newPlot('plotContainer', plotData.data, plotData.layout, {responsive: true});
                this.showNotification('Plot created successfully', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to create plot: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadStatistics() {
        const statsType = document.getElementById('statsType').value;
        
        try {
            this.showLoading(true);

            const response = await fetch(`${this.apiBase}/stats?type=${statsType}`);
            const result = await response.json();

            if (result.success) {
                this.renderStatistics(result, statsType);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to load statistics: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    renderStatistics(result, statsType) {
        const container = document.getElementById('statsContainer');
        container.innerHTML = '';

        switch (statsType) {
            case 'descriptive':
                this.renderDescriptiveStats(container, result.statistics);
                break;
            case 'categorical':
                this.renderCategoricalStats(container, result.statistics);
                break;
            case 'correlation':
                this.renderCorrelationStats(container, result);
                break;
            case 'quality':
                this.renderQualityReport(container, result.quality_report);
                break;
            case 'outliers':
                this.renderOutlierStats(container, result.outlier_info);
                break;
        }
    }

    renderDescriptiveStats(container, statistics) {
        const table = document.createElement('table');
        table.className = 'stats-table';

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Column', 'Count', 'Mean', 'Median', 'Std', 'Min', 'Max'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        Object.entries(statistics).forEach(([column, stats]) => {
            const row = document.createElement('tr');
            [
                column,
                stats.count.toLocaleString(),
                stats.mean?.toFixed(2) || 'N/A',
                stats.median?.toFixed(2) || 'N/A',
                stats.std?.toFixed(2) || 'N/A',
                stats.min?.toFixed(2) || 'N/A',
                stats.max?.toFixed(2) || 'N/A'
            ].forEach(value => {
                const td = document.createElement('td');
                td.textContent = value;
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        container.appendChild(table);
    }

    renderCategoricalStats(container, statistics) {
        const table = document.createElement('table');
        table.className = 'stats-table';

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Column', 'Count', 'Unique', 'Most Frequent', 'Missing'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        Object.entries(statistics).forEach(([column, stats]) => {
            const row = document.createElement('tr');
            [
                column,
                stats.count.toLocaleString(),
                stats.unique_count.toLocaleString(),
                `${stats.most_frequent} (${stats.most_frequent_count})`,
                `${stats.missing_count} (${stats.missing_percentage.toFixed(1)}%)`
            ].forEach(value => {
                const td = document.createElement('td');
                td.textContent = value;
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        container.appendChild(table);
    }

    renderCorrelationStats(container, result) {
        // Significant correlations
        if (result.significant_correlations && result.significant_correlations.length > 0) {
            const title = document.createElement('h4');
            title.textContent = 'Significant Correlations';
            container.appendChild(title);

            const table = document.createElement('table');
            table.className = 'stats-table';

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Column 1', 'Column 2', 'Correlation', 'Strength'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            result.significant_correlations.forEach(corr => {
                const row = document.createElement('tr');
                [
                    corr.column1,
                    corr.column2,
                    corr.correlation.toFixed(3),
                    corr.strength
                ].forEach(value => {
                    const td = document.createElement('td');
                    td.textContent = value;
                    row.appendChild(td);
                });
                tbody.appendChild(row);
            });
            table.appendChild(tbody);

            container.appendChild(table);
        } else {
            container.innerHTML = '<p>No significant correlations found.</p>';
        }
    }

    renderQualityReport(container, report) {
        // Dataset info
        const datasetInfo = document.createElement('div');
        datasetInfo.innerHTML = `
            <h4>Dataset Information</h4>
            <p><strong>Rows:</strong> ${report.dataset_info.total_rows.toLocaleString()}</p>
            <p><strong>Columns:</strong> ${report.dataset_info.total_columns}</p>
            <p><strong>Memory Usage:</strong> ${report.dataset_info.memory_usage_mb.toFixed(2)} MB</p>
        `;
        container.appendChild(datasetInfo);

        // Missing data
        const missingData = document.createElement('div');
        missingData.innerHTML = `
            <h4>Missing Data</h4>
            <p><strong>Total Missing:</strong> ${report.missing_data.total_missing.toLocaleString()}</p>
            <p><strong>Complete Rows:</strong> ${report.missing_data.complete_rows.toLocaleString()}</p>
            <p><strong>Columns with Missing:</strong> ${report.missing_data.columns_with_missing.join(', ')}</p>
        `;
        container.appendChild(missingData);

        // Data types
        const dataTypes = document.createElement('div');
        dataTypes.innerHTML = `
            <h4>Data Types</h4>
            <p><strong>Numeric:</strong> ${report.data_types.numeric_columns.join(', ') || 'None'}</p>
            <p><strong>Categorical:</strong> ${report.data_types.categorical_columns.join(', ') || 'None'}</p>
            <p><strong>Datetime:</strong> ${report.data_types.datetime_columns.join(', ') || 'None'}</p>
        `;
        container.appendChild(dataTypes);
    }

    renderOutlierStats(container, outlierInfo) {
        const table = document.createElement('table');
        table.className = 'stats-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Column', 'Outliers', 'Percentage', 'Method'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        Object.entries(outlierInfo).forEach(([column, info]) => {
            const row = document.createElement('tr');
            [
                column,
                info.outlier_count.toLocaleString(),
                `${info.outlier_percentage.toFixed(2)}%`,
                info.method
            ].forEach(value => {
                const td = document.createElement('td');
                td.textContent = value;
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        container.appendChild(table);
    }

    showDownloadModal() {
        console.log('showDownloadModal() called');
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div class="form-group">
                <label for="downloadFormat">Format:</label>
                <select id="downloadFormat" class="form-control">
                    <option value="csv">CSV</option>
                    <option value="excel">Excel</option>
                    <option value="json">JSON</option>
                </select>
            </div>
            <div class="form-group">
                <label for="downloadFilename">Filename (optional):</label>
                <input type="text" id="downloadFilename" class="form-control" placeholder="cleaned_data">
            </div>
            <div id="downloadProgress" class="upload-progress hidden" style="margin-top: 15px;">
                <div class="progress-bar">
                    <div id="downloadProgressFill" class="progress-fill" style="width: 0%;"></div>
                </div>
                <p id="downloadProgressText">Preparing download...</p>
            </div>
        `;

        // Use arrow function to preserve 'this' context and ensure async handling
        const downloadCallback = async () => {
            console.log('Download modal confirm callback triggered');
            await this.downloadData();
        };
        
        this.showModal('Download Data', downloadCallback, 'Download');
    }

    async downloadData() {
        console.log('downloadData() called');
        try {
            const formatSelect = document.getElementById('downloadFormat');
            const filenameInput = document.getElementById('downloadFilename');
            
            if (!formatSelect) {
                throw new Error('Format select element not found');
            }
            if (!filenameInput) {
                throw new Error('Filename input element not found');
            }
            
            const format = formatSelect.value;
            let filename = filenameInput.value.trim();
            
            console.log('Download parameters:', { format, filename });

            // Add file extension if not provided
            if (filename && !filename.match(/\.(csv|xlsx|json)$/i)) {
                const extensions = {
                    'csv': '.csv',
                    'excel': '.xlsx',
                    'json': '.json'
                };
                filename = filename + extensions[format];
            } else if (!filename) {
                filename = `cleaned_data.${format === 'excel' ? 'xlsx' : format}`;
            }

            // Show progress bar
            const downloadProgress = document.getElementById('downloadProgress');
            const downloadProgressFill = document.getElementById('downloadProgressFill');
            const downloadProgressText = document.getElementById('downloadProgressText');
            
            if (downloadProgress) {
                downloadProgress.classList.remove('hidden');
            }
            
            this.updateDownloadProgress(0, 'Preparing download...');

            // Use XMLHttpRequest for progress tracking
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${this.apiBase}/download`, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.responseType = 'blob';

                // Track download progress
                xhr.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        this.updateDownloadProgress(percentComplete, `Downloading... ${Math.round(percentComplete)}%`);
                    } else {
                        // If total size is unknown, show indeterminate progress
                        this.updateDownloadProgress(50, 'Downloading...');
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const blob = xhr.response;
                        console.log('Blob created:', blob.size, 'bytes, type:', blob.type);
                        
                        if (blob.size === 0) {
                            this.updateDownloadProgress(0, 'Download failed: File is empty');
                            reject(new Error('Downloaded file is empty'));
                            return;
                        }
                        
                        this.updateDownloadProgress(100, 'Download complete!');
                        
                        // Create download link
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        
                        // Clean up after a short delay
                        setTimeout(() => {
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                            if (downloadProgress) {
                                downloadProgress.classList.add('hidden');
                            }
                        }, 500);
                        
                        this.showNotification('Download completed successfully', 'success');
                        this.closeModal();
                        resolve();
                    } else {
                        // Handle error response
                        const contentType = xhr.getResponseHeader('content-type') || '';
                        let errorMessage = 'Download failed';
                        
                        if (contentType.includes('application/json')) {
                            try {
                                const errorBlob = xhr.response;
                                const reader = new FileReader();
                                reader.onload = () => {
                                    try {
                                        const error = JSON.parse(reader.result);
                                        errorMessage = error.error || errorMessage;
                                    } catch (e) {
                                        errorMessage = 'Failed to parse error response';
                                    }
                                    this.updateDownloadProgress(0, `Error: ${errorMessage}`);
                                    reject(new Error(errorMessage));
                                };
                                reader.onerror = () => {
                                    this.updateDownloadProgress(0, `Error: ${errorMessage}`);
                                    reject(new Error(errorMessage));
                                };
                                reader.readAsText(errorBlob);
                            } catch (e) {
                                this.updateDownloadProgress(0, `Error: ${errorMessage}`);
                                reject(new Error(errorMessage));
                            }
                        } else {
                            this.updateDownloadProgress(0, `Error: ${errorMessage} (${xhr.status})`);
                            reject(new Error(`${errorMessage} (${xhr.status})`));
                        }
                    }
                });

                xhr.addEventListener('error', () => {
                    this.updateDownloadProgress(0, 'Network error occurred');
                    reject(new Error('Network error occurred'));
                });

                xhr.addEventListener('abort', () => {
                    this.updateDownloadProgress(0, 'Download cancelled');
                    reject(new Error('Download cancelled'));
                });

                // Send request
                xhr.send(JSON.stringify({
                    format: format,
                    filename: filename.replace(/\.[^.]+$/, '') // Remove extension, backend will add it
                }));
            });
        } catch (error) {
            console.error('Download error:', error);
            this.showNotification(`Download failed: ${error.message}`, 'error');
            const downloadProgress = document.getElementById('downloadProgress');
            if (downloadProgress) {
                downloadProgress.classList.add('hidden');
            }
        } finally {
            this.showLoading(false);
        }
    }

    updateDownloadProgress(percent, text) {
        const downloadProgressFill = document.getElementById('downloadProgressFill');
        const downloadProgressText = document.getElementById('downloadProgressText');
        
        if (downloadProgressFill) {
            downloadProgressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }
        
        if (downloadProgressText) {
            downloadProgressText.textContent = text || `Downloading... ${Math.round(percent)}%`;
        }
    }

    resetData() {
        if (confirm('Are you sure you want to reset all changes? This will reload the original data.')) {
            // This would need to be implemented to reload from session
            this.showNotification('Data reset functionality not yet implemented', 'info');
        }
    }

    newSession() {
        if (confirm('Start a new session? Any unsaved work will be lost.')) {
            this.currentData = null;
            this.currentSession = null;
            this.filteredData = null;
            localStorage.removeItem('alchemist_session');
            
            document.getElementById('workspaceSection').classList.add('hidden');
            document.getElementById('uploadSection').classList.remove('hidden');
            
            this.showNotification('New session started', 'info');
        }
    }

    // Utility methods
    getNumericColumns() {
        if (!this.currentData || this.currentData.length === 0) return [];
        
        return Object.keys(this.currentData[0]).filter(column => {
            const values = this.currentData.map(row => row[column]).filter(val => val !== null && val !== '');
            return values.length > 0 && values.every(val => !isNaN(val));
        });
    }

    showModal(title, onConfirm, confirmText = 'Confirm') {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalOverlay').classList.remove('hidden');
        
        // Create footer buttons
        const modalFooter = document.getElementById('modalFooter');
        modalFooter.innerHTML = `
            <button id="modalCancelBtn" class="btn btn-secondary">Cancel</button>
            <button id="modalConfirmBtn" class="btn btn-primary">${confirmText}</button>
        `;
        
        // Remove any existing listeners by cloning and replacing
        const cancelBtn = document.getElementById('modalCancelBtn');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        
        // Add event listeners with proper handling
        cancelBtn.addEventListener('click', () => {
            console.log('Cancel button clicked');
            this.closeModal();
        });
        
        confirmBtn.addEventListener('click', async () => {
            console.log('Confirm/Download button clicked');
            if (onConfirm) {
                try {
                    // Handle async functions properly
                    const result = onConfirm();
                    if (result instanceof Promise) {
                        await result;
                    }
                } catch (error) {
                    console.error('Error in modal confirm callback:', error);
                    this.showNotification(`Error: ${error.message}`, 'error');
                }
            } else {
                console.warn('No confirm callback provided');
            }
        });
        
        // Store confirm callback
        this.modalConfirmCallback = onConfirm;
    }

    closeModal() {
        document.getElementById('modalOverlay').classList.add('hidden');
        // Clear modal body and footer
        document.getElementById('modalBody').innerHTML = '';
        document.getElementById('modalFooter').innerHTML = '';
        this.modalConfirmCallback = null;
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = document.createElement('i');
        icon.className = this.getNotificationIcon(type);
        
        const text = document.createElement('span');
        text.textContent = message;
        
        notification.appendChild(icon);
        notification.appendChild(text);
        container.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        return icons[type] || icons.info;
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    saveSessionToStorage() {
        if (this.currentSession) {
            localStorage.setItem('alchemist_session', JSON.stringify({
                sessionId: this.currentSession,
                timestamp: new Date().toISOString()
            }));
        }
    }

    loadSessionFromStorage() {
        const stored = localStorage.getItem('alchemist_session');
        if (stored) {
            try {
                const session = JSON.parse(stored);
                // Could implement session restoration here
                console.log('Found stored session:', session.sessionId);
            } catch (error) {
                console.error('Failed to load stored session:', error);
                localStorage.removeItem('alchemist_session');
            }
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AlchemistApp();
});
