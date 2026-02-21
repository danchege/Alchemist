# Alchemist (Linux) - Offline Executable

This release provides a prebuilt Linux executable for Alchemist (Flask backend + web UI).  
It runs locally and works offline.

## What's included
- Upload and work with:
  - CSV
  - Excel (`.xlsx`, `.xls`)
  - JSON
  - SQLite databases (`.db`, `.sqlite`, `.sqlite3`)
  - SQL dumps (`.sql`) (imported into a temporary SQLite database and loaded as a table)
- Case-insensitive filtering and search
- Data cleaning operations and previews
- Export/download in multiple formats
- On startup, executable starts: local server and opens your browser to: correct localhost URL

## Install (Linux)
```bash
# Download the fresh release
curl -L https://github.com/danchege/Alchemist/releases/latest/download/Alchemist-linux-x86_64.tar.gz -o Alchemist-linux-x86_64.tar.gz

# Extract it
tar -xzf Alchemist-linux-x86_64.tar.gz

# Install globally
cd Alchemist-linux-x86_64
sudo ./install.sh


