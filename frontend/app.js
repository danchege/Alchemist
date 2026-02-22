/**
 * Alchemist - Data Cleaning Tool Frontend Application
 * Main JavaScript application for data upload, cleaning, and visualization
 */

class AlchemistApp {
    constructor() {
        this.apiBase = (typeof window !== 'undefined' && window.__ALCHEMIST_API_BASE__) ? window.__ALCHEMIST_API_BASE__ : '/api';
        this.currentData = null;
        this.currentSession = null;
        this.currentView = 'table';
        this.filteredData = null;
        this.currentPage = 1;
        this.rowsPerPage = 10;
        this.searchTerm = '';
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.activeColumnDropdown = null;
        this.largeMode = false;
        this.largeTotalRows = 0;
        this.largeFilter = null;
        this.largeSort = null;
        this.viewHistory = [];
        this.viewRedoStack = [];
        this.maxViewHistory = 30;

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
        document.getElementById('cleanTextBtn').addEventListener('click', () => this.showCleanTextModal());
        document.getElementById('removeEmptyBtn').addEventListener('click', () => this.showRemoveEmptyModal());
        
        // Preview and undo/redo
        document.getElementById('previewBtn').addEventListener('click', () => this.showPreviewModal());
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());

        // Filters
        document.getElementById('applyFilterBtn').addEventListener('click', () => this.applyFilter());
        document.getElementById('clearFiltersBtn').addEventListener('click', () => this.clearFilters());

        // Facets
        document.getElementById('loadFacetBtn').addEventListener('click', () => this.loadFacetProfile());

        // Clustering
        document.getElementById('runClusterBtn').addEventListener('click', () => this.runClustering());

        // Visualizations
        document.getElementById('plotType').addEventListener('change', () => this.updatePlotParameters());
        document.getElementById('createPlotBtn').addEventListener('click', () => this.createPlot());

        // View undo/redo (filter & sort)
        document.getElementById('viewUndoBtn').addEventListener('click', () => this.viewUndo());
        document.getElementById('viewRedoBtn').addEventListener('click', () => this.viewRedo());

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
        document.getElementById('downloadCurrentViewBtn').addEventListener('click', () => this.showDownloadCurrentViewModal());
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
        const validExtensions = ['.csv', '.xlsx', '.xls', '.json', '.db', '.sqlite', '.sqlite3', '.sql'];
        
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExtensions.includes(fileExtension)) {
            this.showNotification('Please upload a CSV, Excel, JSON, SQLite (.db/.sqlite), or SQL (.sql) file', 'error');
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
                this.largeMode = !!result.large_mode;
                this.largeTotalRows = (result.pagination && result.pagination.total_rows) ? result.pagination.total_rows : 0;
                this.largeFilter = null;
                this.largeSort = null;
                
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
        const tableName = data.data_info.sqlite_table;
        const title = data.data_info.filename || 'Dataset';
        document.getElementById('datasetTitle').textContent = tableName
            ? `${title} (table: ${tableName})`
            : title;
        document.getElementById('datasetSize').textContent = `${data.data_info.shape[0].toLocaleString()} rows × ${data.data_info.shape[1]} columns`;

        const largeModeBadge = document.getElementById('largeModeBadge');
        if (largeModeBadge) {
            if (this.largeMode) {
                largeModeBadge.classList.remove('hidden');
            } else {
                largeModeBadge.classList.add('hidden');
            }
        }

        // Update column selectors
        this.updateColumnSelectors(data.data_info.columns);

        // Show table view
        this.switchView('table');
        this.renderTable();
        this.updateViewUndoRedoButtons();
        
        // Load operation history
        this.loadOperationHistory();
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

        const facetColumn = document.getElementById('facetColumn');
        if (facetColumn) {
            facetColumn.innerHTML = '<option value="">Select column...</option>';
            columns.forEach(column => {
                const option = document.createElement('option');
                option.value = column;
                option.textContent = column;
                facetColumn.appendChild(option);
            });
        }

        const clusterColumn = document.getElementById('clusterColumn');
        if (clusterColumn) {
            clusterColumn.innerHTML = '<option value="">Select column...</option>';
            columns.forEach(column => {
                const option = document.createElement('option');
                option.value = column;
                option.textContent = column;
                clusterColumn.appendChild(option);
            });
        }
    }

    async runClustering() {
        const clusterColumn = document.getElementById('clusterColumn');
        const clusterResults = document.getElementById('clusterResults');
        const maxUniqueEl = document.getElementById('clusterMaxUnique');
        if (!clusterColumn || !clusterResults) return;

        const column = clusterColumn.value;
        if (!column) {
            this.showNotification('Please select a clustering column', 'warning');
            return;
        }

        const maxUnique = maxUniqueEl ? parseInt(maxUniqueEl.value || '2000') : 2000;
        const safeMaxUnique = Number.isFinite(maxUnique) ? Math.max(50, Math.min(10000, maxUnique)) : 2000;

        clusterResults.innerHTML = '';
        this.showLoading(true);
        try {
            const params = new URLSearchParams({
                column,
                max_unique: String(safeMaxUnique)
            });
            if (this.currentSession) {
                params.set('session_id', this.currentSession);
            }

            const response = await fetch(`${this.apiBase}/cluster/suggest?${params.toString()}`);
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to suggest clusters');
            }

            const clusters = result.clusters || [];
            if (clusters.length === 0) {
                clusterResults.innerHTML = '<div class="text-muted">No similar values found.</div>';
                return;
            }

            clusters.slice(0, 50).forEach((c, idx) => {
                const card = document.createElement('div');
                card.className = 'cluster-card';

                const header = document.createElement('div');
                header.className = 'cluster-header';

                const title = document.createElement('div');
                title.innerHTML = `<strong>${c.canonical}</strong> <span class="text-muted">(${c.size})</span>`;

                header.appendChild(title);
                card.appendChild(header);

                const members = document.createElement('div');
                members.className = 'cluster-members';

                (c.members || []).forEach((m, mi) => {
                    const row = document.createElement('div');
                    row.className = 'cluster-member';

                    const label = document.createElement('label');
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = true;
                    cb.dataset.value = m.value;

                    const text = document.createElement('span');
                    text.className = 'cluster-member-text';
                    text.title = m.value;
                    text.textContent = m.value;

                    label.appendChild(cb);
                    label.appendChild(text);

                    const count = document.createElement('span');
                    count.className = 'facet-count';
                    count.textContent = (m.count || 0).toLocaleString();

                    row.appendChild(label);
                    row.appendChild(count);
                    members.appendChild(row);
                });

                card.appendChild(members);

                const actions = document.createElement('div');
                actions.className = 'cluster-actions';

                const applyBtn = document.createElement('button');
                applyBtn.type = 'button';
                applyBtn.className = 'btn btn-sm btn-primary';
                applyBtn.textContent = 'Merge to canonical';
                applyBtn.addEventListener('click', async () => {
                    const selected = Array.from(card.querySelectorAll('input[type="checkbox"]'))
                        .filter(x => x.checked)
                        .map(x => x.dataset.value)
                        .filter(v => v !== undefined && v !== null);

                    if (selected.length < 2) {
                        this.showNotification('Select at least 2 values to merge', 'warning');
                        return;
                    }
                    await this.applyClusterMerge(column, c.canonical, selected);
                });

                actions.appendChild(applyBtn);
                card.appendChild(actions);

                clusterResults.appendChild(card);
            });
        } catch (e) {
            this.showNotification(`Clustering failed: ${e.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async applyClusterMerge(column, canonical, values) {
        this.showLoading(true);
        try {
            const response = await fetch(`${this.apiBase}/cluster/apply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSession,
                    column,
                    canonical,
                    values
                })
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to apply merge');
            }

            if (result.data) {
                this.currentData = result.data;
                this.filteredData = null;
            }
            if (result.shape) {
                document.getElementById('datasetSize').textContent = `${result.shape[0].toLocaleString()} rows × ${result.shape[1]} columns`;
            }

            this.currentPage = 1;
            this.renderTable();
            this.loadOperationHistory();
            this.showNotification('Cluster merge applied', 'success');
        } catch (e) {
            this.showNotification(`Merge failed: ${e.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadFacetProfile() {
        const facetColumn = document.getElementById('facetColumn');
        const facetProfile = document.getElementById('facetProfile');
        if (!facetColumn || !facetProfile) return;

        const column = facetColumn.value;
        if (!column) {
            this.showNotification('Please select a facet column', 'warning');
            return;
        }

        this.showLoading(true);
        facetProfile.innerHTML = '';
        try {
            const url = new URL(`${window.location.origin}${this.apiBase}/facets/profile`);
            url.searchParams.set('column', column);
            if (this.currentSession) {
                url.searchParams.set('session_id', this.currentSession);
            }
            url.searchParams.set('top_n', '20');

            const response = await fetch(url.toString());
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to load facet');
            }

            const totalRows = result.total_rows || 0;
            const nullRows = result.null_rows || 0;
            const emptyRows = result.empty_rows || 0;
            const uniqueCount = result.unique_count || 0;
            const topValues = result.top_values || [];

            facetProfile.innerHTML = `
                <div class="facet-metrics">
                    <div><strong>Total</strong>: ${totalRows.toLocaleString()}</div>
                    <div><strong>Unique</strong>: ${uniqueCount.toLocaleString()}</div>
                    <div><strong>Null</strong>: ${nullRows.toLocaleString()}</div>
                    <div><strong>Empty</strong>: ${emptyRows.toLocaleString()}</div>
                </div>
                <div class="facet-values"></div>
            `;

            const valuesContainer = facetProfile.querySelector('.facet-values');
            topValues.forEach(tv => {
                const val = (tv.value === null || tv.value === undefined) ? '' : String(tv.value);
                const count = tv.count || 0;
                const row = document.createElement('div');
                row.className = 'facet-value-row';

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'facet-value-btn';
                btn.title = val;
                btn.textContent = val === '' ? '(empty)' : val;
                btn.addEventListener('click', async () => {
                    document.getElementById('filterColumn').value = column;
                    document.getElementById('filterOperator').value = val === '' ? 'equals' : 'equals';
                    document.getElementById('filterValue').value = val;
                    await this.applyFilter();
                });

                const countEl = document.createElement('span');
                countEl.className = 'facet-count';
                countEl.textContent = count.toLocaleString();

                row.appendChild(btn);
                row.appendChild(countEl);
                valuesContainer.appendChild(row);
            });
        } catch (e) {
            this.showNotification(`Facet load failed: ${e.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
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
        if (this.largeMode) {
            this.renderLargeTable();
            return;
        }
        const data = this.filteredData || this.currentData;
        if (!data || data.length === 0) return;

        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        const tableInfo = document.getElementById('tableInfo');

        // Clear existing content
        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';

        // Create header with dropdown
        const headerRow = document.createElement('tr');
        Object.keys(data[0]).forEach(column => {
            const th = document.createElement('th');
            th.className = 'data-table-th-with-menu';

            const wrapper = document.createElement('div');
            wrapper.className = 'column-header-wrapper';

            const label = document.createElement('span');
            label.className = 'column-header-label';
            label.textContent = column;
            label.title = column;
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                this.sortTable(column, this.sortColumn === column && this.sortDirection === 'asc' ? 'desc' : 'asc');
            });

            const arrowBtn = document.createElement('button');
            arrowBtn.type = 'button';
            arrowBtn.className = 'column-dropdown-trigger';
            arrowBtn.setAttribute('aria-label', `Options for ${column}`);
            arrowBtn.setAttribute('data-column', column);
            arrowBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
            arrowBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                console.log('Arrow clicked for column:', column);
                this.toggleColumnDropdown(e.currentTarget, column);
            });

            wrapper.appendChild(label);
            if (this.sortColumn === column) {
                const sortIcon = document.createElement('i');
                sortIcon.className = this.sortDirection === 'asc' ? 'fas fa-sort-up column-sort-icon' : 'fas fa-sort-down column-sort-icon';
                sortIcon.title = this.sortDirection === 'asc' ? 'Sorted ascending' : 'Sorted descending';
                wrapper.appendChild(sortIcon);
            }
            wrapper.appendChild(arrowBtn);

            const dropdownMenu = document.createElement('div');
            dropdownMenu.className = 'column-dropdown-menu';
            dropdownMenu.setAttribute('role', 'menu');
            dropdownMenu.setAttribute('data-column', column);
            dropdownMenu.innerHTML = `
                <button type="button" class="column-menu-item" data-action="sort-asc" role="menuitem"><i class="fas fa-sort-alpha-down"></i> Sort A → Z</button>
                <button type="button" class="column-menu-item" data-action="sort-desc" role="menuitem"><i class="fas fa-sort-alpha-down-alt"></i> Sort Z → A</button>
                <div class="column-menu-divider"></div>
                <button type="button" class="column-menu-item column-filter-toggle" data-column="${column}" role="menuitem">
                    <i class="fas fa-filter"></i> Filter
                    <i class="fas fa-chevron-right column-filter-chevron"></i>
                </button>
                <div class="column-filter-section" data-column="${column}" style="display: none;">
                    <div class="column-filter-controls">
                        <select class="column-filter-operator" data-column="${column}">
                            <option value="equals">Equals</option>
                            <option value="not_equals">Not Equals</option>
                            <option value="greater_than">Greater Than</option>
                            <option value="less_than">Less Than</option>
                            <option value="contains">Contains</option>
                            <option value="not_contains">Not Contains</option>
                        </select>
                        <input type="text" class="column-filter-value" data-column="${column}" placeholder="Enter value..." />
                        <div class="column-filter-actions">
                            <button type="button" class="btn btn-sm btn-primary column-filter-apply" data-column="${column}">Apply</button>
                            <button type="button" class="btn btn-sm btn-secondary column-filter-clear" data-column="${column}">Clear</button>
                        </div>
                    </div>
                </div>
                <button type="button" class="column-menu-item" data-action="stats" role="menuitem"><i class="fas fa-chart-bar"></i> Column statistics</button>
            `;
            
            // Handle filter toggle
            const filterToggle = dropdownMenu.querySelector('.column-filter-toggle');
            const filterSection = dropdownMenu.querySelector('.column-filter-section');
            filterToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = filterSection.style.display !== 'none';
                filterSection.style.display = isExpanded ? 'none' : 'block';
                filterToggle.querySelector('.column-filter-chevron').style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(90deg)';
                if (!isExpanded) {
                    filterSection.querySelector('.column-filter-value').focus();
                }
            });

            // Handle filter apply
            const filterApplyBtn = dropdownMenu.querySelector('.column-filter-apply');
            filterApplyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const operator = dropdownMenu.querySelector('.column-filter-operator').value;
                const value = dropdownMenu.querySelector('.column-filter-value').value;
                if (!value) {
                    this.showNotification('Please enter a filter value', 'warning');
                    return;
                }
                this.applyColumnFilter(column, operator, value);
                dropdownMenu.classList.remove('open');
                this.activeColumnDropdown = null;
            });

            // Handle filter clear
            const filterClearBtn = dropdownMenu.querySelector('.column-filter-clear');
            filterClearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownMenu.querySelector('.column-filter-value').value = '';
                dropdownMenu.querySelector('.column-filter-operator').value = 'equals';
                this.clearFilters();
                dropdownMenu.classList.remove('open');
                this.activeColumnDropdown = null;
            });

            // Handle other menu items (sort and stats)
            dropdownMenu.querySelectorAll('.column-menu-item[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    // Close dropdown before executing action
                    const wrapper = btn.closest('.column-header-wrapper');
                    const menu = wrapper?.querySelector('.column-dropdown-menu');
                    if (menu) {
                        menu.classList.remove('open');
                    }
                    this.activeColumnDropdown = null;
                    this.openColumnMenu(column, action);
                });
            });
            wrapper.appendChild(dropdownMenu);
            th.appendChild(wrapper);
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

    async renderLargeTable() {
        if (!this.currentSession) return;

        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        const tableInfo = document.getElementById('tableInfo');

        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';

        try {
            this.showLoading(true);

            const params = new URLSearchParams({
                session_id: this.currentSession,
                page: String(this.currentPage),
                page_size: String(this.rowsPerPage)
            });

            if (this.largeSort && this.largeSort.column) {
                params.set('sort_column', this.largeSort.column);
                params.set('sort_dir', this.largeSort.direction || 'asc');
            }

            if (this.largeFilter && this.largeFilter.column) {
                params.set('filter_column', this.largeFilter.column);
                params.set('filter_operator', this.largeFilter.operator);
                params.set('filter_value', this.largeFilter.value);
            }

            if (this.searchTerm && String(this.searchTerm).trim() !== '') {
                params.set('search_term', String(this.searchTerm).trim());
            }

            const response = await fetch(`${this.apiBase}/data/page?${params.toString()}`);
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch page');
            }

            const pageData = result.data || [];
            const columns = result.columns || (pageData[0] ? Object.keys(pageData[0]) : []);
            this.largeTotalRows = typeof result.total_rows === 'number' ? result.total_rows : this.largeTotalRows;

            if (columns.length === 0) {
                tableInfo.textContent = 'No data to display';
                this.updatePagination(this.largeTotalRows || 0);
                return;
            }

            const headerRow = document.createElement('tr');
            columns.forEach(column => {
                const th = document.createElement('th');
                th.className = 'data-table-th-with-menu';

                const wrapper = document.createElement('div');
                wrapper.className = 'column-header-wrapper';

                const label = document.createElement('span');
                label.className = 'column-header-label';
                label.textContent = column;
                label.title = column;
                label.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const nextDir = (this.largeSort && this.largeSort.column === column && this.largeSort.direction === 'asc') ? 'desc' : 'asc';
                    this.sortTable(column, nextDir);
                });

                const arrowBtn = document.createElement('button');
                arrowBtn.type = 'button';
                arrowBtn.className = 'column-dropdown-trigger';
                arrowBtn.setAttribute('aria-label', `Options for ${column}`);
                arrowBtn.setAttribute('data-column', column);
                arrowBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                arrowBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.toggleColumnDropdown(e.currentTarget, column);
                });

                wrapper.appendChild(label);
                const sortCol = this.largeSort && this.largeSort.column;
                const sortDir = this.largeSort && this.largeSort.direction;
                if (sortCol === column && sortDir) {
                    const sortIcon = document.createElement('i');
                    sortIcon.className = sortDir === 'asc' ? 'fas fa-sort-up column-sort-icon' : 'fas fa-sort-down column-sort-icon';
                    sortIcon.title = sortDir === 'asc' ? 'Sorted ascending' : 'Sorted descending';
                    wrapper.appendChild(sortIcon);
                }
                wrapper.appendChild(arrowBtn);

                const dropdownMenu = document.createElement('div');
                dropdownMenu.className = 'column-dropdown-menu';
                dropdownMenu.setAttribute('role', 'menu');
                dropdownMenu.setAttribute('data-column', column);
                const currentOp = (this.largeFilter && this.largeFilter.column === column) ? this.largeFilter.operator : 'equals';
                const currentVal = (this.largeFilter && this.largeFilter.column === column) ? (this.largeFilter.value || '') : '';
                dropdownMenu.innerHTML = `
                    <button type="button" class="column-menu-item" data-action="sort-asc" role="menuitem"><i class="fas fa-sort-alpha-down"></i> Sort A → Z</button>
                    <button type="button" class="column-menu-item" data-action="sort-desc" role="menuitem"><i class="fas fa-sort-alpha-down-alt"></i> Sort Z → A</button>
                    <div class="column-menu-divider"></div>
                    <button type="button" class="column-menu-item column-filter-toggle" data-column="${column}" role="menuitem">
                        <i class="fas fa-filter"></i> Filter
                        <i class="fas fa-chevron-right column-filter-chevron"></i>
                    </button>
                    <div class="column-filter-section" data-column="${column}" style="display: none;">
                        <div class="column-filter-controls">
                            <select class="column-filter-operator" data-column="${column}">
                                <option value="equals" ${currentOp === 'equals' ? 'selected' : ''}>Equals</option>
                                <option value="not_equals" ${currentOp === 'not_equals' ? 'selected' : ''}>Not Equals</option>
                                <option value="greater_than" ${currentOp === 'greater_than' ? 'selected' : ''}>Greater Than</option>
                                <option value="less_than" ${currentOp === 'less_than' ? 'selected' : ''}>Less Than</option>
                                <option value="contains" ${currentOp === 'contains' ? 'selected' : ''}>Contains</option>
                                <option value="not_contains" ${currentOp === 'not_contains' ? 'selected' : ''}>Not Contains</option>
                            </select>
                            <input type="text" class="column-filter-value" data-column="${column}" placeholder="Enter value..." />
                            <div class="column-filter-actions">
                                <button type="button" class="btn btn-sm btn-primary column-filter-apply" data-column="${column}">Apply</button>
                                <button type="button" class="btn btn-sm btn-secondary column-filter-clear" data-column="${column}">Clear</button>
                            </div>
                        </div>
                    </div>
                    <button type="button" class="column-menu-item" data-action="stats" role="menuitem"><i class="fas fa-chart-bar"></i> Column statistics</button>
                `;
                dropdownMenu.querySelector('.column-filter-value').value = currentVal;

                const filterToggle = dropdownMenu.querySelector('.column-filter-toggle');
                const filterSection = dropdownMenu.querySelector('.column-filter-section');
                filterToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isExpanded = filterSection.style.display !== 'none';
                    filterSection.style.display = isExpanded ? 'none' : 'block';
                    filterToggle.querySelector('.column-filter-chevron').style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(90deg)';
                    if (!isExpanded) {
                        filterSection.querySelector('.column-filter-value').focus();
                    }
                });

                const filterApplyBtn = dropdownMenu.querySelector('.column-filter-apply');
                filterApplyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const operator = dropdownMenu.querySelector('.column-filter-operator').value;
                    const value = dropdownMenu.querySelector('.column-filter-value').value;
                    if (!value) {
                        this.showNotification('Please enter a filter value', 'warning');
                        return;
                    }
                    this.applyColumnFilter(column, operator, value);
                    dropdownMenu.classList.remove('open');
                    this.activeColumnDropdown = null;
                });

                const filterClearBtn = dropdownMenu.querySelector('.column-filter-clear');
                filterClearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdownMenu.querySelector('.column-filter-value').value = '';
                    dropdownMenu.querySelector('.column-filter-operator').value = 'equals';
                    this.clearFilters();
                    dropdownMenu.classList.remove('open');
                    this.activeColumnDropdown = null;
                });

                dropdownMenu.querySelectorAll('.column-menu-item[data-action]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const action = btn.dataset.action;
                        const wr = btn.closest('.column-header-wrapper');
                        const menu = wr?.querySelector('.column-dropdown-menu');
                        if (menu) menu.classList.remove('open');
                        this.activeColumnDropdown = null;
                        this.openColumnMenu(column, action);
                    });
                });
                wrapper.appendChild(dropdownMenu);
                th.appendChild(wrapper);
                headerRow.appendChild(th);
            });
            tableHeader.appendChild(headerRow);

            pageData.forEach(row => {
                const tr = document.createElement('tr');
                columns.forEach(col => {
                    const td = document.createElement('td');
                    const value = row[col];
                    td.textContent = value !== null && value !== undefined ? String(value) : '';
                    td.title = value !== null && value !== undefined ? String(value) : '';
                    tr.appendChild(td);
                });
                tableBody.appendChild(tr);
            });

            const startIndex = (this.currentPage - 1) * this.rowsPerPage;
            const endIndex = startIndex + pageData.length;
            const total = this.largeTotalRows || 0;
            tableInfo.textContent = `Showing ${Math.min(startIndex + 1, total)}-${Math.min(endIndex, total)} of ${total} rows`;

            this.updatePagination(total);
        } catch (e) {
            this.showNotification(`Failed to render large table: ${e.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
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

    toggleColumnDropdown(triggerElement, column) {
        // Close any other open dropdowns
        if (this.activeColumnDropdown && this.activeColumnDropdown !== triggerElement) {
            const otherMenu = this.activeColumnDropdown.closest('.column-header-wrapper')?.querySelector('.column-dropdown-menu');
            if (otherMenu) {
                otherMenu.classList.remove('open');
            }
        }
        
        // Find the menu - it's a sibling of the trigger within the wrapper
        const wrapper = triggerElement.closest('.column-header-wrapper');
        if (!wrapper) {
            console.error('Wrapper not found for column:', column);
            return;
        }
        
        const menu = wrapper.querySelector('.column-dropdown-menu');
        if (!menu) {
            console.error('Dropdown menu not found for column:', column, 'Wrapper:', wrapper);
            return;
        }
        
        console.log('Menu found:', menu, 'Current classes:', menu.className);
        
        const isOpen = menu.classList.contains('open');
        console.log('Is open:', isOpen);
        
        if (isOpen) {
            // Close it
            menu.classList.remove('open');
            this.activeColumnDropdown = null;
            console.log('Dropdown closed');
        } else {
            // Open it
            menu.classList.add('open');
            this.activeColumnDropdown = triggerElement;
            console.log('Dropdown opened, menu classes:', menu.className);
            console.log('Menu computed style display:', window.getComputedStyle(menu).display);
            
            // Add click handler to close when clicking outside
            const closeHandler = (e) => {
                if (!menu.contains(e.target) && 
                    triggerElement !== e.target && 
                    !triggerElement.contains(e.target) &&
                    !wrapper.contains(e.target)) {
                    menu.classList.remove('open');
                    document.removeEventListener('click', closeHandler, true);
                    this.activeColumnDropdown = null;
                }
            };
            // Use setTimeout to avoid immediate closure
            setTimeout(() => {
                document.addEventListener('click', closeHandler, true);
            }, 0);
        }
    }

    openColumnMenu(column, action) {
        // Close the dropdown
        if (this.activeColumnDropdown) {
            const wrapper = this.activeColumnDropdown.closest('.column-header-wrapper');
            const menu = wrapper?.querySelector('.column-dropdown-menu');
            if (menu) {
                menu.classList.remove('open');
            }
        }
        this.activeColumnDropdown = null;
        
        if (action === 'sort-asc') this.sortTable(column, 'asc');
        else if (action === 'sort-desc') this.sortTable(column, 'desc');
        else if (action === 'stats') this.openStatsForColumn(column);
    }

    async applyColumnFilter(column, operator, value) {
        this.saveViewStateToHistory();
        try {
            await this.applyFilterInternal(column, operator, value);
            this.currentPage = 1;
            document.getElementById('filterColumn').value = column;
            document.getElementById('filterOperator').value = operator;
            document.getElementById('filterValue').value = value;
            this.renderTable();
            this.updateViewUndoRedoButtons();
            this.showNotification(`Filter applied: ${column} ${operator} "${value}"`, 'success');
        } catch (error) {
            this.viewHistory.pop();
            this.updateViewUndoRedoButtons();
            this.showNotification(`Failed to apply filter: ${error.message}`, 'error');
        }
    }

    openStatsForColumn(column) {
        this.switchView('stats');
        this.loadStatistics();
        this.showNotification(`Statistics loaded. See "${column}" in the stats panels.`, 'info');
    }

    sortTable(column, direction = 'asc', skipViewHistory = false) {
        if (this.largeMode) {
            this.largeSort = { column, direction };
            this.currentPage = 1;
            this.renderTable();
            return;
        }
        const data = this.filteredData || this.currentData;
        if (!data) return;

        if (!skipViewHistory) {
            this.saveViewStateToHistory();
        }

        this.sortColumn = column;
        this.sortDirection = direction;
        const mult = direction === 'desc' ? -1 : 1;

        data.sort((a, b) => {
            const aVal = a[column];
            const bVal = b[column];

            if (aVal === null) return 1 * mult;
            if (bVal === null) return -1 * mult;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * mult;
            }

            return String(aVal).localeCompare(String(bVal)) * mult;
        });

        this.renderTable();
        this.updateViewUndoRedoButtons();
    }

    async removeDuplicates() {
        try {
            this.showLoading(true, 'Removing Duplicates', 'Finding and removing duplicate rows...');
            
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
                this.loadOperationHistory();
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

            this.showLoading(true, 'Filling Missing Values', `Filling missing values in ${column} using ${method}...`);

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
                this.loadOperationHistory();
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

    showConvertTypesModal() {
        const modalBody = document.getElementById('modalBody');
        const columns = this.currentData ? Object.keys(this.currentData[0]) : [];

        modalBody.innerHTML = `
            <div class="form-group">
                <label>Select columns to convert:</label>
                <div class="checkbox-group" style="max-height: 200px; overflow-y: auto;">
                    ${columns.map(col => `
                        <label class="checkbox-label">
                            <input type="checkbox" value="${col}" checked> ${col}
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label for="targetType">Target Type:</label>
                <select id="targetType" class="form-control">
                    <option value="numeric">Numeric</option>
                    <option value="string">String</option>
                    <option value="datetime">DateTime</option>
                    <option value="boolean">Boolean</option>
                </select>
            </div>
        `;

        this.showModal('Convert Data Types', () => this.convertTypes());
    }

    async convertTypes() {
        try {
            const selectedColumns = Array.from(document.querySelectorAll('#modalBody input[type="checkbox"]:checked'))
                .map(cb => cb.value);

            if (selectedColumns.length === 0) {
                this.showNotification('Please select at least one column', 'warning');
                return;
            }

            const targetType = document.getElementById('targetType').value;

            this.showLoading(true, 'Converting Data Types', `Converting selected columns to ${targetType}...`);

            const response = await fetch(`${this.apiBase}/clean`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    operation: 'convert_types',
                    columns: selectedColumns,
                    target_type: targetType,
                    session_id: this.currentSession
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.filteredData = null;
                this.currentPage = 1;
                this.renderTable();
                this.showNotification('Data types converted successfully', 'success');
                this.closeModal();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to convert data types: ${error.message}`, 'error');
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
                this.loadOperationHistory();
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

    getViewState() {
        const filterColumn = document.getElementById('filterColumn');
        const filterOperator = document.getElementById('filterOperator');
        const filterValue = document.getElementById('filterValue');
        const hasFilter = this.filteredData !== null && filterColumn && filterColumn.value && filterValue && filterValue.value;
        return {
            filter: hasFilter
                ? {
                    column: filterColumn.value,
                    operator: filterOperator ? filterOperator.value : 'equals',
                    value: filterValue.value
                }
                : null,
            sortColumn: this.sortColumn,
            sortDirection: this.sortDirection
        };
    }

    saveViewStateToHistory() {
        const state = this.getViewState();
        this.viewHistory.push(state);
        if (this.viewHistory.length > this.maxViewHistory) {
            this.viewHistory.shift();
        }
        this.viewRedoStack = [];
        this.updateViewUndoRedoButtons();
    }

    updateViewUndoRedoButtons() {
        const undoBtn = document.getElementById('viewUndoBtn');
        const redoBtn = document.getElementById('viewRedoBtn');
        if (undoBtn) undoBtn.disabled = this.viewHistory.length === 0;
        if (redoBtn) redoBtn.disabled = this.viewRedoStack.length === 0;
    }

    async restoreViewState(state) {
        const filterColumn = document.getElementById('filterColumn');
        const filterOperator = document.getElementById('filterOperator');
        const filterValue = document.getElementById('filterValue');
        if (state.filter) {
            if (filterColumn) filterColumn.value = state.filter.column;
            if (filterOperator) filterOperator.value = state.filter.operator;
            if (filterValue) filterValue.value = state.filter.value;
            await this.applyFilterInternal(state.filter.column, state.filter.operator, state.filter.value);
        } else {
            this.filteredData = null;
            this.currentPage = 1;
            if (filterColumn) filterColumn.value = '';
            if (filterOperator) filterOperator.value = 'equals';
            if (filterValue) filterValue.value = '';
        }
        this.sortColumn = state.sortColumn;
        this.sortDirection = state.sortDirection || 'asc';
        const data = this.filteredData || this.currentData;
        if (data && this.sortColumn) {
            const mult = this.sortDirection === 'desc' ? -1 : 1;
            data.sort((a, b) => {
                const aVal = a[this.sortColumn];
                const bVal = b[this.sortColumn];
                if (aVal === null) return 1 * mult;
                if (bVal === null) return -1 * mult;
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return (aVal - bVal) * mult;
                }
                return String(aVal).localeCompare(String(bVal)) * mult;
            });
        }
        this.renderTable();
        this.updateViewUndoRedoButtons();
    }

    async viewUndo() {
        if (this.viewHistory.length === 0) return;
        const state = this.viewHistory.pop();
        this.viewRedoStack.push(this.getViewState());
        this.showLoading(true);
        try {
            await this.restoreViewState(state);
            this.showNotification('View change undone', 'info');
        } finally {
            this.showLoading(false);
        }
    }

    async viewRedo() {
        if (this.viewRedoStack.length === 0) return;
        const state = this.viewRedoStack.pop();
        this.viewHistory.push(this.getViewState());
        this.showLoading(true);
        try {
            await this.restoreViewState(state);
            this.showNotification('View change redone', 'info');
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

        this.saveViewStateToHistory();

        try {
            await this.applyFilterInternal(column, operator, value);
            this.currentPage = 1;
            this.renderTable();
            this.updateViewUndoRedoButtons();
            this.showNotification('Filter applied successfully', 'success');
        } catch (error) {
            this.viewHistory.pop(); // remove the state we just pushed
            this.updateViewUndoRedoButtons();
            this.showNotification(`Failed to apply filter: ${error.message}`, 'error');
        }
    }

    async applyFilterInternal(column, operator, value) {
        if (this.largeMode) {
            this.largeFilter = { column, operator, value };
            this.currentPage = 1;
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`${this.apiBase}/filter`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSession,
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
            } else {
                throw new Error(result.error);
            }
        } finally {
            this.showLoading(false);
        }
    }

    clearFilters() {
        this.saveViewStateToHistory();
        this.filteredData = null;
        if (this.largeMode) {
            this.largeFilter = null;
        }
        this.currentPage = 1;
        document.getElementById('filterColumn').value = '';
        document.getElementById('filterOperator').value = 'equals';
        document.getElementById('filterValue').value = '';
        this.renderTable();
        this.updateViewUndoRedoButtons();
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

    showDownloadCurrentViewModal() {
        const data = this.filteredData || this.currentData;
        if (!data || data.length === 0) {
            this.showNotification('No data to download. Load a dataset first.', 'warning');
            return;
        }
        const isFiltered = !!this.filteredData;
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <p class="download-current-view-desc">
                ${isFiltered
                    ? `Download the <strong>current table view</strong> (${data.length.toLocaleString()} rows after filter).`
                    : `Download the full current dataset (${data.length.toLocaleString()} rows).`}
            </p>
            <div class="download-format-grid">
                <button type="button" class="btn btn-success download-current-format" data-format="csv"><i class="fas fa-file-csv"></i> CSV</button>
                <button type="button" class="btn btn-success download-current-format" data-format="excel"><i class="fas fa-file-excel"></i> Excel</button>
                <button type="button" class="btn btn-success download-current-format" data-format="json"><i class="fas fa-file-code"></i> JSON</button>
                <button type="button" class="btn btn-success download-current-format" data-format="tsv"><i class="fas fa-file-alt"></i> TSV</button>
                <button type="button" class="btn btn-success download-current-format" data-format="html"><i class="fas fa-file-code"></i> HTML</button>
                <button type="button" class="btn btn-success download-current-format" data-format="sql"><i class="fas fa-database"></i> SQL</button>
            </div>
        `;
        modalBody.querySelectorAll('.download-current-format').forEach(btn => {
            btn.addEventListener('click', () => {
                const format = btn.dataset.format;
                const dateStr = new Date().toISOString().slice(0, 10);
                const name = isFiltered ? 'current_view' : 'dataset';
                let filename = `${name}_${dateStr}.${format === 'excel' ? 'xlsx' : format === 'sql' ? 'sql' : format}`;
                switch (format) {
                    case 'csv': this.downloadDataAsCSV(data, filename); break;
                    case 'excel': this.downloadDataAsExcel(data, filename); break;
                    case 'json': this.downloadDataAsJSON(data, filename); break;
                    case 'tsv': this.downloadDataAsTSV(data, filename); break;
                    case 'html': this.downloadDataAsHTML(data, filename); break;
                    case 'sql': this.downloadDataAsSQL(data, filename, name); break;
                }
                this.closeModal();
            });
        });
        this.showModal('Download current table view', () => {}, 'Done');
        document.getElementById('modalFooter').innerHTML = '<button type="button" class="btn btn-secondary" onclick="app.closeModal()">Close</button>';
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
                    <option value="tsv">TSV</option>
                    <option value="html">HTML</option>
                    <option value="sql">SQL</option>
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

            // Handle TSV, HTML, and SQL (normal mode only) client-side; SQL in large mode goes to backend
            const sqlLargeMode = format === 'sql' && this.largeMode;
            if (!sqlLargeMode && (format === 'tsv' || format === 'html' || format === 'sql')) {
                const data = this.filteredData || this.currentData;
                if (!data || data.length === 0) {
                    throw new Error('No data to download');
                }
                const dateStr = new Date().toISOString().slice(0, 10);
                if (!filename) {
                    filename = `cleaned_data_${dateStr}.${format === 'sql' ? 'sql' : format}`;
                } else if (!filename.match(/\.(tsv|html|sql)$/i)) {
                    filename = filename + (format === 'tsv' ? '.tsv' : format === 'sql' ? '.sql' : '.html');
                }
                if (format === 'tsv') {
                    this.downloadDataAsTSV(data, filename);
                } else if (format === 'sql') {
                    const tableName = (filenameInput.value.trim() || 'exported_data').replace(/[^a-zA-Z0-9_]/g, '_') || 'exported_data';
                    this.downloadDataAsSQL(data, filename, tableName);
                } else {
                    this.downloadDataAsHTML(data, filename);
                }
                this.closeModal();
                return;
            }

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

                // Send request (include session_id for large-mode SQL export)
                const payload = {
                    format: format,
                    filename: filename.replace(/\.[^.]+$/, '') // Remove extension, backend will add it
                };
                if (format === 'sql' && this.largeMode && this.currentSession) {
                    payload.session_id = this.currentSession;
                }
                xhr.send(JSON.stringify(payload));
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
        this.resetDataAsync();
    }

    async resetDataAsync() {
        if (!confirm('Are you sure you want to reset all changes? This will reload the original data.')) {
            return;
        }

        try {
            this.showLoading(true);

            const response = await fetch(`${this.apiBase}/reset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSession
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.filteredData = null;
                this.currentPage = 1;
                this.renderTable();

                this.updateUndoRedoButtons(false, false);
                this.showNotification(result.message || 'Data reset successfully', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to reset data: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    newSession() {
        if (!confirm('Start a new session? Any unsaved work will be lost.')) {
            return;
        }
        
        // Clear all data state
        this.currentData = null;
        this.currentSession = null;
        this.filteredData = null;
        this.currentPage = 1;
        this.rowsPerPage = 25;
        this.searchTerm = '';
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.activeColumnDropdown = null;
        this.viewHistory = [];
        this.viewRedoStack = [];
        localStorage.removeItem('alchemist_session');

        // Hide loading overlay and clear any loading states
        this.showLoading(false);
        
        // Close any open modals
        this.closeModal();

        // Reset upload UI - show upload area, hide progress
        const uploadProgress = document.getElementById('uploadProgress');
        const uploadArea = document.getElementById('uploadArea');
        if (uploadProgress) uploadProgress.classList.add('hidden');
        if (uploadArea) uploadArea.classList.remove('hidden');

        // Reset file input
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';

        // Hide workspace, show upload section
        document.getElementById('workspaceSection').classList.add('hidden');
        document.getElementById('uploadSection').classList.remove('hidden');

        // Clear search and filter inputs
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        const filterColumn = document.getElementById('filterColumn');
        if (filterColumn) filterColumn.innerHTML = '<option value="">Select column...</option>';
        const filterOperator = document.getElementById('filterOperator');
        if (filterOperator) filterOperator.value = 'equals';
        const filterValue = document.getElementById('filterValue');
        if (filterValue) filterValue.value = '';

        // Clear table display
        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        const tableInfo = document.getElementById('tableInfo');
        const tablePagination = document.getElementById('tablePagination');
        if (tableHeader) tableHeader.innerHTML = '';
        if (tableBody) tableBody.innerHTML = '';
        if (tableInfo) tableInfo.textContent = '';
        if (tablePagination) tablePagination.innerHTML = '';

        // Reset view to table (for next load)
        this.switchView('table');
        
        this.showNotification('New session started. Upload a file to begin.', 'info');
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

    showLoading(show, message = null, subtext = null) {
        const overlay = document.getElementById('loadingOverlay');
        const titleElement = overlay.querySelector('p');
        const subtextElement = overlay.querySelector('.loading-subtext');
        
        if (show) {
            // Update message if provided
            if (message) {
                titleElement.textContent = message;
            } else {
                titleElement.textContent = 'Processing Data';
            }
            
            // Update subtext if provided
            if (subtext) {
                subtextElement.textContent = subtext;
            } else {
                subtextElement.textContent = 'Please wait while we clean your data...';
            }
            
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    showCleanTextModal() {
        const modalBody = document.getElementById('modalBody');
        const columns = this.currentData ? Object.keys(this.currentData[0]) : [];

        modalBody.innerHTML = `
            <div class="form-group">
                <label>Select Columns:</label>
                <div class="checkbox-group">
                    ${columns.map(col => `
                        <label class="checkbox-label">
                            <input type="checkbox" value="${col}" checked> ${col}
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label>Text Operations:</label>
                <div class="checkbox-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="trimWhitespace" checked> Trim Whitespace
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="normalizeCase"> Normalize Case
                    </label>
                </div>
            </div>
            <div class="form-group" id="caseTypeGroup" style="display: none;">
                <label for="caseType">Case Type:</label>
                <select id="caseType" class="form-control">
                    <option value="lower">Lowercase</option>
                    <option value="upper">Uppercase</option>
                    <option value="title">Title Case</option>
                </select>
            </div>
        `;

        // Show/hide case type options
        document.getElementById('normalizeCase').addEventListener('change', (e) => {
            document.getElementById('caseTypeGroup').style.display = e.target.checked ? 'block' : 'none';
        });

        this.showModal('Clean Text Data', () => this.cleanText());
    }

    async cleanText() {
        try {
            const selectedColumns = Array.from(document.querySelectorAll('#modalBody input[type="checkbox"]:checked'))
                .map(cb => cb.value)
                .filter(val => !['trimWhitespace', 'normalizeCase'].includes(val));

            const textOperations = [];
            if (document.getElementById('trimWhitespace').checked) {
                textOperations.push('trim_whitespace');
            }
            if (document.getElementById('normalizeCase').checked) {
                textOperations.push('normalize_case');
            }

            if (selectedColumns.length === 0 || textOperations.length === 0) {
                this.showNotification('Please select columns and operations', 'warning');
                return;
            }

            this.showLoading(true, 'Cleaning Text Data', 'Cleaning text in selected columns...');

            const response = await fetch(`${this.apiBase}/clean`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSession,
                    operations: [{
                        type: 'clean_text',
                        columns: selectedColumns,
                        text_operations: textOperations,
                        case_type: document.getElementById('caseType').value
                    }]
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.filteredData = null;
                this.renderTable();
                this.loadOperationHistory();
                this.showNotification('Text cleaning completed successfully', 'success');
                this.closeModal();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to clean text: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showRemoveEmptyModal() {
        const modalBody = document.getElementById('modalBody');

        modalBody.innerHTML = `
            <div class="form-group">
                <label>Target:</label>
                <div class="radio-group">
                    <label class="radio-label">
                        <input type="radio" name="target" value="rows" checked> Remove Empty Rows
                    </label>
                    <label class="radio-label">
                        <input type="radio" name="target" value="columns"> Remove Empty Columns
                    </label>
                </div>
            </div>
        `;

        this.showModal('Remove Empty Rows/Columns', () => this.removeEmpty());
    }

    async removeEmpty() {
        try {
            const target = document.querySelector('input[name="target"]:checked').value;

            this.showLoading(true, 'Removing Empty Rows/Columns', `Removing empty ${target}...`);

            const response = await fetch(`${this.apiBase}/clean`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSession,
                    operations: [{
                        type: 'remove_empty',
                        target: target
                    }]
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.filteredData = null;
                this.renderTable();
                this.loadOperationHistory();
                this.showNotification(`Empty ${target} removed successfully`, 'success');
                this.closeModal();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to remove empty ${target}: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showPreviewModal() {
        const modalBody = document.getElementById('modalBody');
        const columns = this.currentData ? Object.keys(this.currentData[0]) : [];

        modalBody.innerHTML = `
            <div class="form-group">
                <label>Select Operations to Preview:</label>
                <div class="checkbox-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="previewDuplicates"> Remove Duplicates
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="previewEmpty"> Remove Empty Rows
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="previewText"> Clean Text
                    </label>
                </div>
            </div>
            <div class="form-group">
                <label for="sampleSize">Sample Size:</label>
                <select id="sampleSize" class="form-control">
                    <option value="50">50 rows</option>
                    <option value="100" selected>100 rows</option>
                    <option value="200">200 rows</option>
                </select>
            </div>
            <div class="form-group" id="textOptions" style="display: none;">
                <label>Text Operations:</label>
                <div class="checkbox-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="previewTrim"> Trim Whitespace
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="previewCase"> Normalize Case
                    </label>
                </div>
            </div>
        `;

        // Show/hide text options
        document.getElementById('previewText').addEventListener('change', (e) => {
            document.getElementById('textOptions').style.display = e.target.checked ? 'block' : 'none';
        });

        this.showModal('Preview Operations', () => this.previewOperations());
    }

    async previewOperations() {
        try {
            const operations = [];

            if (document.getElementById('previewDuplicates').checked) {
                operations.push({ type: 'remove_duplicates' });
            }

            if (document.getElementById('previewEmpty').checked) {
                operations.push({ type: 'remove_empty', target: 'rows' });
            }

            if (document.getElementById('previewText').checked) {
                const textOps = [];
                if (document.getElementById('previewTrim').checked) {
                    textOps.push('trim_whitespace');
                }
                if (document.getElementById('previewCase').checked) {
                    textOps.push('normalize_case');
                }

                if (textOps.length > 0) {
                    const columns = Object.keys(this.currentData[0]);
                    operations.push({
                        type: 'clean_text',
                        columns: columns,
                        text_operations: textOps,
                        case_type: 'lower'
                    });
                }
            }

            if (operations.length === 0) {
                this.showNotification('Please select at least one operation to preview', 'warning');
                return;
            }

            const sampleSize = parseInt(document.getElementById('sampleSize').value);

            // Use filtered data if user has applied a filter, so preview reflects current view
            const dataToPreview = this.filteredData || this.currentData;
            const payload = {
                operations: operations,
                sample_size: sampleSize
            };
            if (this.filteredData && this.filteredData.length > 0) {
                payload.data = this.filteredData.slice(0, sampleSize);
            }

            this.showLoading(true, 'Previewing Operations', 'Generating preview of selected operations...');

            const response = await fetch(`${this.apiBase}/preview`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                this.showPreviewResults(result);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to preview operations: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showPreviewResults(result) {
        const modalBody = document.getElementById('modalBody');

        const bindPreviewDownloadButtons = (container, res) => {
            if (!container) return;
            container.querySelectorAll('.preview-download-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const [which, format] = btn.dataset.download.split('-');
                    const data = which === 'original' ? res.original_data : res.preview_data;
                    if (!data || data.length === 0) {
                        this.showNotification('No data to download', 'warning');
                        return;
                    }
                    const dateStr = new Date().toISOString().slice(0, 10);
                    let filename = `preview_${which}_${dateStr}.${format === 'excel' ? 'xlsx' : format === 'sql' ? 'sql' : format}`;
                    switch (format) {
                        case 'csv': this.downloadDataAsCSV(data, filename); break;
                        case 'excel': this.downloadDataAsExcel(data, filename); break;
                        case 'json': this.downloadDataAsJSON(data, filename); break;
                        case 'tsv': this.downloadDataAsTSV(data, filename); break;
                        case 'html': this.downloadDataAsHTML(data, filename); break;
                        case 'sql': this.downloadDataAsSQL(data, filename, `preview_${which}`); break;
                        default: this.showNotification(`Unsupported format: ${format}`, 'error');
                    }
                });
            });
        };

        let html = `
            <div class="preview-results">
                <div class="preview-header-actions">
                    <h4>Preview Results</h4>
                    <div class="preview-undo-redo">
                        <button type="button" class="btn btn-sm btn-outline preview-undo-btn" id="previewUndoBtn" disabled title="Undo last operation">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline preview-redo-btn" id="previewRedoBtn" disabled title="Redo last undone operation">
                            <i class="fas fa-redo"></i>
                        </button>
                    </div>
                </div>
                <p><strong>Note:</strong> ${result.note}</p>
                
                <div class="preview-download-section">
                    <h5><i class="fas fa-download"></i> Download preview data</h5>
                    <p class="preview-download-hint">Download the tables below in your preferred format.</p>
                    <div class="preview-download-actions preview-download-inline">
                        <div class="download-group">
                            <span class="download-group-label">Original (before operations):</span>
                            <div class="download-buttons">
                                <button type="button" class="btn btn-sm btn-success preview-download-btn" data-download="original-csv"><i class="fas fa-file-csv"></i> CSV</button>
                                <button type="button" class="btn btn-sm btn-success preview-download-btn" data-download="original-excel"><i class="fas fa-file-excel"></i> Excel</button>
                                <button type="button" class="btn btn-sm btn-success preview-download-btn" data-download="original-json"><i class="fas fa-file-code"></i> JSON</button>
                                <button type="button" class="btn btn-sm btn-success preview-download-btn" data-download="original-tsv"><i class="fas fa-file-alt"></i> TSV</button>
                                <button type="button" class="btn btn-sm btn-success preview-download-btn" data-download="original-html"><i class="fas fa-file-code"></i> HTML</button>
                                <button type="button" class="btn btn-sm btn-success preview-download-btn" data-download="original-sql"><i class="fas fa-database"></i> SQL</button>
                            </div>
                        </div>
                        <div class="download-group">
                            <span class="download-group-label">Preview (after operations):</span>
                            <div class="download-buttons">
                                <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-csv"><i class="fas fa-file-csv"></i> CSV</button>
                                <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-excel"><i class="fas fa-file-excel"></i> Excel</button>
                                <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-json"><i class="fas fa-file-code"></i> JSON</button>
                                <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-tsv"><i class="fas fa-file-alt"></i> TSV</button>
                                <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-html"><i class="fas fa-file-code"></i> HTML</button>
                                <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-sql"><i class="fas fa-database"></i> SQL</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <h5>Operation Summary</h5>
                <ul>
                    ${result.results.map(op => `
                        <li>${op.operation}: ${op.removed ? `Removed ${op.removed} items` : `Affected ${op.affected_rows || op.columns.length} columns`}</li>
                    `).join('')}
                </ul>
                
                <div class="preview-comparison">
                    <div class="preview-section">
                        <h6>Original Data (Sample)</h6>
                        <div class="table-container">
                            ${this.createPreviewTable(result.original_data)}
                        </div>
                    </div>
                    <div class="preview-section">
                        <h6>Preview Data (After Operations)</h6>
                        <div class="table-container">
                            ${this.createPreviewTable(result.preview_data)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        modalBody.innerHTML = html;
        bindPreviewDownloadButtons(modalBody, result);

        // Setup undo/redo buttons in preview modal
        const previewUndoBtn = document.getElementById('previewUndoBtn');
        const previewRedoBtn = document.getElementById('previewRedoBtn');
        if (previewUndoBtn) {
            previewUndoBtn.addEventListener('click', async () => {
                await this.undo();
                // Reload preview if modal is still open
                if (!document.getElementById('modalOverlay').classList.contains('hidden')) {
                    // Optionally refresh preview or just close modal
                    this.closeModal();
                }
            });
        }
        if (previewRedoBtn) {
            previewRedoBtn.addEventListener('click', async () => {
                await this.redo();
                if (!document.getElementById('modalOverlay').classList.contains('hidden')) {
                    this.closeModal();
                }
            });
        }
        // Update button states
        this.loadOperationHistory().then(() => {
            const historyResponse = fetch(`${this.apiBase}/history`).then(r => r.json());
            historyResponse.then(historyResult => {
                if (historyResult.success) {
                    if (previewUndoBtn) previewUndoBtn.disabled = !historyResult.can_undo;
                    if (previewRedoBtn) previewRedoBtn.disabled = !historyResult.can_redo;
                }
            }).catch(() => {});
        });

        const modalFooter = document.getElementById('modalFooter');
        modalFooter.innerHTML = `
            <div class="preview-download-actions">
                <span class="download-group-label">Download:</span>
                <div class="download-buttons">
                    <button type="button" class="btn btn-sm btn-success preview-download-btn" data-download="original-csv">Original CSV</button>
                    <button type="button" class="btn btn-sm btn-success preview-download-btn" data-download="original-excel">Original Excel</button>
                    <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-csv">Preview CSV</button>
                    <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-excel">Preview Excel</button>
                    <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-json">Preview JSON</button>
                    <button type="button" class="btn btn-sm btn-primary preview-download-btn" data-download="preview-sql">Preview SQL</button>
                </div>
            </div>
            <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Close</button>
        `;
        bindPreviewDownloadButtons(modalFooter, result);
    }

    downloadDataAsCSV(data, filename = 'data.csv') {
        if (!data || data.length === 0) return;
        const headers = Object.keys(data[0]);
        const escape = (v) => {
            const s = String(v ?? '');
            if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };
        const row = (obj) => headers.map(h => escape(obj[h])).join(',');
        const csv = [headers.join(','), ...data.map(row)].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        this.triggerDownload(blob, filename);
    }

    downloadDataAsTSV(data, filename = 'data.tsv') {
        if (!data || data.length === 0) return;
        const headers = Object.keys(data[0]);
        const row = (obj) => headers.map(h => String(obj[h] ?? '')).join('\t');
        const tsv = [headers.join('\t'), ...data.map(row)].join('\r\n');
        const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
        this.triggerDownload(blob, filename);
    }

    downloadDataAsSQL(data, filename = 'data.sql', tableName = 'exported_data') {
        if (!data || data.length === 0) return;
        const safeName = (s) => String(s).replace(/[^a-zA-Z0-9_]/g, '_') || 'col';
        const backtick = (name) => '`' + String(name).replace(/`/g, '``') + '`';
        // MySQL-compatible string escape: \ and '
        const escape = (v) => {
            if (v === null || v === undefined) return 'NULL';
            const s = String(v);
            return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
        };
        const headers = Object.keys(data[0]);
        const safeHeaders = headers.map((h, i) => safeName(h) || 'col_' + i);
        const tableId = backtick(safeName(tableName) || 'exported_data');
        const dbName = backtick('alchemist_export');
        const createTable = `-- MySQL-compatible export (run entire script in MySQL Workbench)\nCREATE DATABASE IF NOT EXISTS ${dbName};\nUSE ${dbName};\n\nCREATE TABLE IF NOT EXISTS ${tableId} (\n  ${safeHeaders.map(h => `${backtick(h)} TEXT`).join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;
        const insertLines = data.map(row => {
            const values = headers.map(h => escape(row[h]));
            return `INSERT INTO ${tableId} (${safeHeaders.map(h => backtick(h)).join(', ')}) VALUES (${values.join(', ')});`;
        });
        const sql = createTable + insertLines.join('\n');
        const blob = new Blob([sql], { type: 'text/plain;charset=utf-8;' });
        this.triggerDownload(blob, filename);
    }

    downloadDataAsExcel(data, filename = 'data.xlsx') {
        if (!data || data.length === 0) return;
        
        if (typeof XLSX === 'undefined') {
            this.showNotification('Excel library not loaded. Please refresh the page.', 'error');
            return;
        }

        try {
            const headers = Object.keys(data[0]);
            const worksheetData = [
                headers,
                ...data.map(row => headers.map(h => row[h] ?? ''))
            ];
            
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
            
            XLSX.writeFile(workbook, filename);
            this.showNotification(`Downloaded ${filename}`, 'success');
        } catch (error) {
            this.showNotification(`Failed to generate Excel file: ${error.message}`, 'error');
        }
    }

    downloadDataAsHTML(data, filename = 'data.html') {
        if (!data || data.length === 0) return;
        const headers = Object.keys(data[0]);
        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        
        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Export</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-top: 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th {
            background-color: #4a90e2;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #e0e0e0;
        }
        tr:hover {
            background-color: #f9f9f9;
        }
        .meta {
            color: #666;
            font-size: 0.9em;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Data Export</h1>
        <div class="meta">
            <p>Exported on: ${new Date().toLocaleString()}</p>
            <p>Total rows: ${data.length}</p>
            <p>Total columns: ${headers.length}</p>
        </div>
        <table>
            <thead>
                <tr>
                    ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${data.map(row => `
                    <tr>
                        ${headers.map(h => `<td>${escapeHtml(String(row[h] ?? ''))}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>`;
        
        const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
        this.triggerDownload(blob, filename);
    }

    downloadDataAsJSON(data, filename = 'data.json') {
        if (!data || data.length === 0) return;
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        this.triggerDownload(blob, filename);
    }

    triggerDownload(blob, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        this.showNotification(`Downloaded ${filename}`, 'success');
    }

    createPreviewTable(data) {
        if (!data || data.length === 0) return '<p>No data to display</p>';

        const headers = Object.keys(data[0]);
        let html = '<table class="preview-table"><thead><tr>';
        
        headers.forEach(header => {
            html += `<th>${header}</th>`;
        });
        
        html += '</tr></thead><tbody>';
        
        data.forEach(row => {
            html += '<tr>';
            headers.forEach(header => {
                const value = row[header];
                html += `<td>${value !== null && value !== undefined ? value : ''}</td>`;
            });
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        return html;
    }

    async undo() {
        try {
            this.showLoading(true);

            const response = await fetch(`${this.apiBase}/undo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.filteredData = null;
                this.renderTable();
                this.loadOperationHistory(); // Refresh history display
                this.showNotification(result.message || 'Undo successful', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to undo: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async redo() {
        try {
            this.showLoading(true);

            const response = await fetch(`${this.apiBase}/redo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.currentData = result.data;
                this.filteredData = null;
                this.renderTable();
                this.loadOperationHistory(); // Refresh history display
                this.showNotification(result.message || 'Redo successful', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`Failed to redo: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadOperationHistory() {
        try {
            const response = await fetch(`${this.apiBase}/history`);
            const result = await response.json();

            if (result.success) {
                this.updateUndoRedoButtons(result.can_undo, result.can_redo);
                this.displayOperationHistory(result.history || []);
            }
        } catch (error) {
            console.error('Failed to load operation history:', error);
        }
    }

    displayOperationHistory(history) {
        const historyContainer = document.getElementById('operationHistory');
        if (!historyContainer) return;

        if (history.length === 0) {
            historyContainer.innerHTML = '<p class="history-empty">No operations yet. Perform data cleaning operations to see history.</p>';
            return;
        }

        const historyList = history.slice().reverse(); // Show most recent first
        historyContainer.innerHTML = `
            <div class="history-list">
                ${historyList.map((item, idx) => {
                    const date = new Date(item.timestamp);
                    const timeStr = date.toLocaleTimeString();
                    const dateStr = date.toLocaleDateString();
                    const shape = item.shape ? `${item.shape[0]} rows × ${item.shape[1]} cols` : 'N/A';
                    return `
                        <div class="history-item ${idx === 0 ? 'history-item-latest' : ''}">
                            <div class="history-item-header">
                                <span class="history-operation">${item.description || 'Operation'}</span>
                                <span class="history-time">${dateStr} ${timeStr}</span>
                            </div>
                            <div class="history-item-details">
                                <span class="history-shape">${shape}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    updateUndoRedoButtons(canUndo, canRedo) {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        if (undoBtn) undoBtn.disabled = !canUndo;
        if (redoBtn) redoBtn.disabled = !canRedo;
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
