/**
 * ImageUpload — accepts wound/clinical photos, converts to base64 for the
 * MedGemma-4B enrichment endpoint. Supports drag-and-drop and click-to-browse.
 */
import { useState, useRef, useCallback } from 'react';
import { Camera, X, Image as ImageIcon, Upload } from 'lucide-react';

const MAX_IMAGES = 4;
const MAX_SIZE_MB = 5;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function ImageUpload({ images = [], onChange, disabled = false, compact = false }) {
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef(null);

    const addFiles = useCallback(async (files) => {
        const newImages = [...images];
        for (const file of files) {
            if (newImages.length >= MAX_IMAGES) break;
            if (!ACCEPTED_TYPES.includes(file.type)) continue;
            if (file.size > MAX_SIZE_MB * 1024 * 1024) continue;

            const base64 = await fileToBase64(file);
            newImages.push({
                name: file.name,
                size: file.size,
                type: file.type,
                base64,
                preview: URL.createObjectURL(file),
            });
        }
        onChange(newImages);
    }, [images, onChange]);

    const removeImage = useCallback((idx) => {
        const updated = images.filter((_, i) => i !== idx);
        onChange(updated);
    }, [images, onChange]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        addFiles(Array.from(e.dataTransfer.files));
    }, [addFiles, disabled]);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
    }, [disabled]);

    if (compact && images.length === 0) {
        return (
            <button
                type="button"
                className="image-upload-compact-btn"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
            >
                <Camera size={16} />
                <span>Add Wound Photo</span>
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => addFiles(Array.from(e.target.files))}
                />
            </button>
        );
    }

    return (
        <div className="image-upload-container">
            {images.length > 0 && (
                <div className="image-upload-previews">
                    {images.map((img, idx) => (
                        <div key={idx} className="image-upload-thumb">
                            <img src={img.preview} alt={img.name} />
                            {!disabled && (
                                <button
                                    className="image-upload-remove"
                                    onClick={() => removeImage(idx)}
                                    title="Remove"
                                >
                                    <X size={12} />
                                </button>
                            )}
                            <span className="image-upload-name">{img.name}</span>
                        </div>
                    ))}
                </div>
            )}

            {images.length < MAX_IMAGES && !disabled && (
                <div
                    className={`image-upload-dropzone ${dragOver ? 'drag-over' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => inputRef.current?.click()}
                >
                    <Upload size={20} />
                    <span>
                        {images.length === 0
                            ? 'Upload wound photos for AI analysis'
                            : `Add more (${images.length}/${MAX_IMAGES})`
                        }
                    </span>
                    <span className="image-upload-hint">JPEG, PNG, WebP up to {MAX_SIZE_MB}MB</span>
                    <input
                        ref={inputRef}
                        type="file"
                        accept={ACCEPTED_TYPES.join(',')}
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => addFiles(Array.from(e.target.files))}
                    />
                </div>
            )}
        </div>
    );
}
