# Surgical Copilot - GitHub Repository

## 📁 Repository Structure

```
surgical-copilot-github/
│
├── README.md                 # Project overview and quick start
├── SETUP.md                  # Detailed setup instructions
├── CONTRIBUTING.md           # Contribution guidelines
├── LICENSE                   # MIT License
├── .gitignore               # Git ignore rules
├── quickstart.sh            # Linux/Mac quick start script
├── quickstart.bat           # Windows quick start script
│
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI application (cleaned)
│   │   ├── engine.py        # Model inference engine (cleaned)
│   │   ├── json_parser.py   # JSON parsing utilities
│   │   ├── schemas.py       # Pydantic models
│   │   ├── derive.py        # Risk derivation logic
│   │   ├── storage.py       # Data persistence
│   │   └── sse_manager.py   # Server-sent events
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Environment configuration template
│
└── frontend/
    ├── src/
    │   ├── pages/           # React pages
    │   ├── components/      # UI components
    │   ├── api/            # API client
    │   ├── lib/            # Utilities
    │   └── data/           # Mock data
    ├── package.json        # Node dependencies
    └── vite.config.js      # Vite configuration
```
