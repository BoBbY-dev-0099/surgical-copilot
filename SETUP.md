# Setup Guide

## Prerequisites

### Required Software
- **Python 3.9+** ([Download](https://www.python.org/downloads/))
- **Node.js 16+** ([Download](https://nodejs.org/))
- **Git** ([Download](https://git-scm.com/))

### Optional (for real inference)
- **CUDA 11.8+** for GPU support
- **40GB+ VRAM** for running full models
- **HuggingFace Account** with MedGemma access

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/surgical-copilot.git
cd surgical-copilot
```

### 2. Backend Setup

#### Create Virtual Environment
```bash
cd backend
python -m venv venv
```

#### Activate Virtual Environment
- **Linux/Mac**: `source venv/bin/activate`
- **Windows**: `venv\Scripts\activate`

#### Install Dependencies
```bash
pip install -r requirements.txt
```

#### Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

## Configuration

### Environment Variables

Edit `backend/.env`:

```env
# For demo mode (no GPU required)
DEMO_MODE=true

# For real inference (requires GPU and models)
DEMO_MODE=false
HF_TOKEN=your_huggingface_token
MODEL_ID=google/medgemma-27b-text-it
MODEL_4B_ID=google/medgemma-4b-it
```

### Model Setup (Real Inference Only)

1. **Get HuggingFace Access**
   - Create account at [HuggingFace](https://huggingface.co)
   - Request access to [MedGemma models](https://huggingface.co/google/medgemma)
   - Generate access token

2. **Download LoRA Adapters**
   - Adapters are required for specialized clinical domains
   - Contact project maintainers for adapter access
   - Place in directories specified in `.env`

## Running the Application

### Quick Start (Demo Mode)

#### Windows
```bash
quickstart.bat
```

#### Linux/Mac
```bash
chmod +x quickstart.sh
./quickstart.sh
```

### Manual Start

#### Backend
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
python app/main.py
```

#### Frontend
```bash
cd frontend
npm run dev
```

### Production Build

```bash
cd frontend
npm run build
npm run preview
```

## Accessing the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Change port in .env
API_PORT=8001

# Or kill existing process
lsof -i :8000  # Find process
kill -9 <PID>  # Kill process
```

#### Module Not Found
```bash
# Ensure virtual environment is activated
# Reinstall dependencies
pip install -r requirements.txt
```

#### CUDA Out of Memory
- Set `DEMO_MODE=true` for testing without GPU
- Reduce batch size in configuration
- Use model quantization

#### CORS Errors
- Ensure backend is running before frontend
- Check API_URL in frontend configuration

### Getting Help

1. Check [Issues](https://github.com/yourusername/surgical-copilot/issues)
2. Read [FAQ](docs/FAQ.md)
3. Open new issue with:
   - Error messages
   - System information
   - Steps to reproduce

## Next Steps

- Read [User Guide](docs/USER_GUIDE.md)
- Explore [API Documentation](http://localhost:8000/docs)
- Try different clinical scenarios
- Contribute improvements!

## Support

For questions or issues:
- Open GitHub issue
- Contact maintainers
- Join discussions