"use client";

import React, { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Move } from 'lucide-react';

export default function ThreeDicomViewer({ dcmUrl, file, onClose, inline = false }: { dcmUrl?: string, file?: File, onClose: () => void, inline?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pan and Zoom state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let active = true;

    async function loadDicom() {
      try {
        // @ts-ignore
        const daikon = (await import('daikon')).default;
        
        let arrayBuffer: ArrayBuffer;

        if (file) {
          arrayBuffer = await file.arrayBuffer();
        } else if (dcmUrl) {
          const response = await fetch(dcmUrl);
          if (!response.ok) throw new Error('Network response was not ok');
          arrayBuffer = await response.arrayBuffer();
        } else {
          throw new Error('No DICOM source provided');
        }
        
        if (!active) return;

        // Parse DICOM
        const data = new DataView(arrayBuffer);
        const image = daikon.Series.parseImage(data);
        
        if (!image) throw new Error('Invalid DICOM file');
        if (!image.hasPixelData()) throw new Error('No pixel data found');

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = image.getCols();
        const height = image.getRows();
        
        canvas.width = width;
        canvas.height = height;

        // Get raw pixel data
        const pixelData = image.getInterpretedData();

        // Calculate min/max for fallback windowing
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < pixelData.length; i++) {
          if (pixelData[i] < min) min = pixelData[i];
          if (pixelData[i] > max) max = pixelData[i];
        }

        // Get window settings from DICOM or fallback to min/max
        const windowCenter = image.getWindowCenter() || ((max + min) / 2);
        const windowWidth = image.getWindowWidth() || (max - min) || 256;
        
        const minWindow = windowCenter - (windowWidth / 2);
        const maxWindow = windowCenter + (windowWidth / 2);

        const imgData = ctx.createImageData(width, height);
        for (let i = 0; i < pixelData.length; i++) {
          let val = pixelData[i];
          
          // Apply Window/Level Transformation
          if (val <= minWindow) val = 0;
          else if (val >= maxWindow) val = 255;
          else val = ((val - minWindow) / windowWidth) * 255;
          
          val = Math.max(0, Math.min(255, Math.round(val)));

          imgData.data[i * 4] = val;     // R
          imgData.data[i * 4 + 1] = val; // G
          imgData.data[i * 4 + 2] = val; // B
          imgData.data[i * 4 + 3] = 255;          // A
        }
        
        ctx.putImageData(imgData, 0, 0);
        
        // Auto-fit scale
        if (containerRef.current) {
          const cw = containerRef.current.clientWidth;
          const ch = containerRef.current.clientHeight;
          const fitScale = Math.min(cw / width, ch / height) * 0.9;
          setScale(fitScale);
        }

        setLoading(false);
      } catch (err: any) {
        console.error(err);
        if (active) {
          setError("DICOM yüklenirken hata oluştu veya format desteklenmiyor.");
          setLoading(false);
        }
      }
    }

    loadDicom();

    return () => {
      active = false;
    };
  }, [dcmUrl]);

  // Handle Pan and Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    setScale(s => Math.max(0.1, Math.min(s - e.deltaY * zoomSensitivity, 10)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const innerContent = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', ...(!inline && { background: 'var(--bg)', border: '1px solid var(--glass-border)', borderRadius: 16, width: '90%', maxWidth: 1000, height: '80vh', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }) }}>
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--foreground)' }}>Röntgen Görüntüleyici</h3>
        <div style={{ display: 'flex', gap: 16 }}>
          <button onClick={() => setScale(s => s * 1.2)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: 8, color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ZoomIn size={18} /></button>
          <button onClick={() => setScale(s => s / 1.2)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: 8, color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ZoomOut size={18} /></button>
          <button onClick={onClose} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: 8, color: '#ef4444', cursor: 'pointer', marginLeft: 8, display: 'flex', alignItems: 'center' }}><X size={18} /></button>
        </div>
      </div>
      
      <div 
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: isDragging.current ? 'grabbing' : 'grab', background: '#000', borderRadius: inline ? '0 0 16px 16px' : 0 }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#fff' }}>Yükleniyor...</div>}
        {error && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#ef4444' }}>{error}</div>}
        
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
          transformOrigin: 'center center',
        }}>
          <canvas ref={canvasRef} style={{ display: loading || error ? 'none' : 'block' }} />
        </div>
      </div>
    </div>
  );

  if (inline) {
    return innerContent;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {innerContent}
    </div>
  );
}
