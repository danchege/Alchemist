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
1. Download: latest release archive
```bash
curl -L https://github.com/danchege/Alchemist/releases/latest/download/Alchemist-linux-x86_64.tar.gz -o Alchemist-linux-x86_64.tar.gz
```

2. Extract: archive
```bash
tar -xzf Alchemist-linux-x86_64.tar.gz
```

3. Install: globally
```bash
cd Alchemist-linux-x86_64
sudo ./install.sh
```

4. Run
```bash
Alchemist
```

## Useful environment variables
```bash
# Change port
PORT=5001 Alchemist

# Disable browser auto-open
ALCH_OPEN_BROWSER=0 Alchemist
```

## Verify download (optional)
```bash
sha256sum -c Alchemist-linux-x86_64.tar.gz.sha256
```

## Notes
- First run may take a moment while Matplotlib builds its font cache.
- This is a PyInstaller onedir bundle (the folder contains required libraries).
```
