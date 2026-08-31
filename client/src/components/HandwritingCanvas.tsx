import React, { useRef, useState, useEffect } from "react";
import { Eraser, Trash2, Undo } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HandwritingCanvasProps {
  onSave: (dataUrl: string) => void;
  defaultValue?: string;
  disabled?: boolean;
}

export default function HandwritingCanvas({ onSave, defaultValue, disabled = false }: HandwritingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas resolution
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0B132B";
    ctx.lineWidth = 2;

    if (defaultValue) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = defaultValue;
    }
  }, [defaultValue]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    
    // Prevent scrolling when drawing on touch devices
    if ('touches' in e) e.preventDefault();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;

    ctx.lineTo(x, y);
    ctx.stroke();
    
    if ('touches' in e) e.preventDefault();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    save();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    onSave(dataUrl);
    setHistory([...history, dataUrl]);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSave("");
  };

  return (
    <div className="space-y-2">
      <div className={`bg-white rounded-lg p-2 border-2 border-[#D4AF37]/30 ${disabled ? 'opacity-90' : ''}`}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-[300px] cursor-crosshair touch-none"
          style={{ touchAction: 'none' }}
        />
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={clear}><Eraser className="w-4 h-4 mr-2" /> Clear</Button>
          <Button size="sm" variant="ghost" onClick={() => {
            const last = history[history.length - 2];
            if (last) {
              setHistory(history.slice(0, -1));
              // Restore would require redrawing the whole image
            }
          }}><Undo className="w-4 h-4 mr-2" /> Undo</Button>
        </div>
      )}
    </div>
  );
}
