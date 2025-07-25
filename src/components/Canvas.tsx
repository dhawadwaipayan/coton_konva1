import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Image as KonvaImage, Transformer, Text as KonvaText, Rect } from 'react-konva';
import { uploadBoardImage, imageElementToBlob } from '../lib/utils';

// Helper to generate grid lines for a 5000x5000 board
function generateGridLines(size = 5000, gridSize = 20) {
  const lines = [];
  // Vertical lines
  for (let x = 0; x <= size; x += gridSize) {
    lines.push({ points: [x, 0, x, size] });
  }
  // Horizontal lines
  for (let y = 0; y <= size; y += gridSize) {
    lines.push({ points: [0, y, size, y] });
  }
  return lines;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export const Canvas = forwardRef(function CanvasStub(props: any, ref) {
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);

  const boardWidth = 5000;
  const boardHeight = 5000;
  const gridLines = generateGridLines(boardWidth, 20);

  // Get viewport size
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  React.useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Hand tool state
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState<{x: number, y: number} | null>(null);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  // Images state: store loaded HTMLImageElement
  const [images, setImages] = useState<Array<{ id: string, image: HTMLImageElement, x: number, y: number, width?: number, height?: number, rotation?: number, timestamp: number, error?: boolean }>>([]);
  // Strokes state: freehand lines
  const [strokes, setStrokes] = useState<Array<{ id: string, points: number[], color: string, size: number, x: number, y: number, width: number, height: number, rotation: number, timestamp: number }>>([]);
  const [drawing, setDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{ id: string, points: number[], color: string, size: number, x: number, y: number, width: number, height: number, rotation: number, timestamp: number } | null>(null);
  // Replace selection state and logic
  // Remove selectedId, selectedType
  // Use only selectedIds: Array<{ id: string, type: 'image' | 'stroke' }>
  const [selectedIds, setSelectedIds] = useState<Array<{ id: string, type: 'image' | 'stroke' | 'text' }>>([]);
  const [selectionRect, setSelectionRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
  const [groupDragStart, setGroupDragStart] = useState<{ x: number, y: number, items: Array<{ id: string, type: 'image' | 'stroke' | 'text', x: number, y: number }> } | null>(null);

  // Add texts state
  const [texts, setTexts] = useState<Array<{ id: string, text: string, x: number, y: number, color: string, fontSize: number, rotation: number, timestamp: number }>>([]);
  // Add state for editing text
  const [editingText, setEditingText] = useState<null | {
    id: string;
    value: string;
    x: number;
    y: number;
    color: string;
    fontSize: number;
    rotation: number;
  }>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState<Array<{ images: typeof images; strokes: typeof strokes; texts: typeof texts }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ images: typeof images; strokes: typeof strokes; texts: typeof texts }>>([]);

  // Helper to push current state to undo stack
  const pushToUndoStack = useCallback(() => {
    setUndoStack(prev => {
      const newStack = [...prev, { images: JSON.parse(JSON.stringify(images)), strokes: JSON.parse(JSON.stringify(strokes)), texts: JSON.parse(JSON.stringify(texts)) }];
      // Limit to 50 entries
      return newStack.length > 50 ? newStack.slice(newStack.length - 50) : newStack;
    });
    setRedoStack([]); // Clear redo stack on new action
  }, [images, strokes, texts]);

  // Undo handler
  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      setRedoStack(rStack => [{ images, strokes, texts }, ...rStack]);
      const last = prev[prev.length - 1];
      setImages(last.images);
      setStrokes(last.strokes);
      setTexts(last.texts);
      return prev.slice(0, -1);
    });
  }, [images, strokes, texts]);

  // Redo handler
  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      setUndoStack(uStack => [...uStack, { images, strokes, texts }]);
      const next = prev[0];
      setImages(next.images);
      setStrokes(next.strokes);
      setTexts(next.texts);
      return prev.slice(1);
    });
  }, [images, strokes, texts]);

  // Call onSelectedImageSrcChange with the data URL of the selected image (if one image is selected), or null if not
    useEffect(() => {
    if (!props.onSelectedImageSrcChange) return;
    const selectedImageIds = selectedIds.filter(sel => sel.type === 'image');
    if (selectedImageIds.length === 1) {
      const imgObj = images.find(img => img.id === selectedImageIds[0].id);
      if (imgObj && imgObj.image) {
        // Create a canvas to get the data URL
        const canvas = document.createElement('canvas');
        canvas.width = imgObj.width || imgObj.image.width;
        canvas.height = imgObj.height || imgObj.image.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(imgObj.image, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          props.onSelectedImageSrcChange(dataUrl);
        } else {
          props.onSelectedImageSrcChange(null);
        }
      } else {
        props.onSelectedImageSrcChange(null);
      }
    } else {
      props.onSelectedImageSrcChange(null);
    }
  }, [selectedIds, images]);

  // Add state for Sketch mode bounding box
  const [sketchBox, setSketchBox] = useState<null | { x: number, y: number, width: number, height: number }>(null);
  const [sketchBoxDrawing, setSketchBoxDrawing] = useState(false);
  const [sketchBoxStart, setSketchBoxStart] = useState<{ x: number, y: number } | null>(null);
  const sketchBoxRef = useRef<any>(null);
  const sketchBoxTransformerRef = useRef<any>(null);

  // Add state for Render mode bounding box (completely independent)
  const [renderBox, setRenderBox] = useState<null | { x: number, y: number, width: number, height: number }>(null);
  const [renderBoxDrawing, setRenderBoxDrawing] = useState(false);
  const [renderBoxStart, setRenderBoxStart] = useState<{ x: number, y: number } | null>(null);
  const renderBoxRef = useRef<any>(null);
  const renderBoxTransformerRef = useRef<any>(null);

  // Call onRenderBoundingBoxChange whenever renderBox changes
  useEffect(() => {
    if (props.onRenderBoundingBoxChange) {
      props.onRenderBoundingBoxChange(renderBox);
    }
  }, [renderBox]);

  // Manual save function - upload images to Supabase Storage
  const saveBoardContent = useCallback(async () => {
    if (!props.onContentChange || !props.boardContent) return;
    
    try {
      // Upload images to Supabase Storage and get URLs
      const serializedImages = await Promise.all(
        images.map(async (img) => {
          if (img.image && !img.error) {
            try {
              // Convert image to blob and upload to storage
              const blob = await imageElementToBlob(img.image, img.width, img.height);
              const imageUrl = await uploadBoardImage(props.boardContent.user_id, props.boardContent.id, img.id, blob);
              
              return {
                id: img.id,
                x: img.x,
                y: img.y,
                width: img.width,
                height: img.height,
                rotation: img.rotation,
                timestamp: img.timestamp,
                src: imageUrl, // Supabase Storage URL
                error: false
              };
            } catch (uploadError) {
              console.error('Failed to upload image:', uploadError);
              return {
                id: img.id,
                x: img.x,
                y: img.y,
                width: img.width,
                height: img.height,
                rotation: img.rotation,
                timestamp: img.timestamp,
                src: null,
                error: true
              };
            }
          } else {
            // Handle images without HTMLImageElement or with errors
            return {
              id: img.id,
              x: img.x,
              y: img.y,
              width: img.width,
              height: img.height,
              rotation: img.rotation,
              timestamp: img.timestamp,
              src: null,
              error: img.error || true
            };
          }
        })
      );

      const content = {
        id: props.boardContent.id,
        images: serializedImages,
        strokes,
        texts
      };
      
      console.log('Manually saving board content with storage URLs:', content);
      props.onContentChange(content);
    } catch (error) {
      console.error('Error saving board content:', error);
    }
  }, [images, strokes, texts, props.boardContent, props.onContentChange]);

  // Expose importImage method on ref
  useImperativeHandle(ref, () => ({
    exportCurrentBoundingBoxAsPng: () => {
      // Use sketchBox for Sketch mode, renderBox for Render mode
      const activeBox = props.renderModeActive ? renderBox : sketchBox;
      if (!activeBox) return null;
      const stage = stageRef.current;
      if (!stage) return null;
      // Add stagePos to sketchBox coordinates for correct cropping
      return stage.toDataURL({
        x: activeBox.x + stagePos.x,
        y: activeBox.y + stagePos.y,
        width: activeBox.width,
        height: activeBox.height,
        pixelRatio: 1,
      });
    },
    exportCurrentRenderBoxAsPng: () => {
      if (!renderBox) return null;
      const stage = stageRef.current;
      if (!stage) return null;
      // Add stagePos to renderBox coordinates for correct cropping
      return stage.toDataURL({
        x: renderBox.x + stagePos.x,
        y: renderBox.y + stagePos.y,
        width: renderBox.width,
        height: renderBox.height,
        pixelRatio: 1,
      });
    },
    importImage: (src: string, x?: number, y?: number, width?: number, height?: number, onLoadId?: (id: string) => void) => {
      pushToUndoStack();
      const img = new window.Image();
      img.src = src;
      const id = Date.now().toString();
      img.onload = () => {
        setImages(prev => [
          ...prev,
          { id, image: img, x: x ?? 100, y: y ?? 100, width: width ?? 200, height: height ?? 200, rotation: 0, timestamp: Date.now() }
        ]);
        if (onLoadId) onLoadId(id);
      };
      img.onerror = () => {
        console.error('Failed to load image:', src);
        setImages(prev => [
          ...prev,
          { id, image: null, x: x ?? 100, y: y ?? 100, width: width ?? 200, height: height ?? 200, rotation: 0, timestamp: Date.now(), error: true }
        ]);
        if (onLoadId) onLoadId(id);
      };
      return id;
    },
    clearSketchBox: () => setSketchBox(null),
    clearRenderBox: () => setRenderBox(null),
    // Expose current pan offset for correct AI image placement
    get stagePos() { return stagePos; },
    // Expose current bounding box for correct AI image placement
    get sketchBox() { return sketchBox; },
    get renderBox() { return renderBox; },
    replaceImageById: (id: string, newSrc: string) => {
      setImages(prev => {
        const idx = prev.findIndex(img => img.id === id);
        if (idx === -1) return prev;
        const oldImg = prev[idx];
        const newImg = new window.Image();
        newImg.src = newSrc;
        const newImageObj = {
          id,
          image: newImg,
          x: oldImg.x,
          y: oldImg.y,
          width: oldImg.width,
          height: oldImg.height,
          rotation: oldImg.rotation,
          timestamp: Date.now()
        };
        newImg.onload = () => {
          setImages(current => [
            ...current.slice(0, idx),
            newImageObj,
            ...current.slice(idx + 1)
          ]);
        };
        // Remove the old image for now (will be replaced on load)
        return prev.filter((_, i) => i !== idx);
      });
    },
    replaceSelectedImage: (newSrc: string) => {
      // Find the currently selected image
      const selectedImage = selectedIds.find(sel => sel.type === 'image');
      if (selectedImage) {
        // Use the existing replaceImageById method
        const id = selectedImage.id;
        setImages(prev => {
          const idx = prev.findIndex(img => img.id === id);
          if (idx === -1) return prev;
          const oldImg = prev[idx];
          const newImg = new window.Image();
          newImg.src = newSrc;
          const newImageObj = {
            id,
            image: newImg,
            x: oldImg.x,
            y: oldImg.y,
            width: oldImg.width,
            height: oldImg.height,
            rotation: oldImg.rotation,
            timestamp: Date.now()
          };
          newImg.onload = () => {
            setImages(current => [
              ...current.slice(0, idx),
              newImageObj,
              ...current.slice(idx + 1)
            ]);
          };
          // Remove the old image for now (will be replaced on load)
          return prev.filter((_, i) => i !== idx);
        });
      }
    },
    setSelectedIds: (ids: Array<{ id: string, type: 'image' | 'stroke' | 'text' }>) => setSelectedIds(ids),
    // Expose manual save function
    saveBoardContent,
    undo: handleUndo,
    redo: handleRedo,
  }), [sketchBox, renderBox, stageRef, stagePos, props.renderModeActive, saveBoardContent, handleUndo, handleRedo]);

  // Only load board content when board ID changes
  const lastBoardIdRef = useRef<string | null>(null);
    useEffect(() => {
    if (!props.boardContent) {
      // Clear all content when no board is selected (during overlays)
      setImages([]);
      setStrokes([]);
      setTexts([]);
      lastBoardIdRef.current = null;
      return;
    }
    
    // Check if we have a valid board content object with the expected structure
    if (props.boardContent && lastBoardIdRef.current !== props.boardContent.id) {
      console.log('Loading board content:', props.boardContent);
      
      // Load strokes and texts directly
      setStrokes(props.boardContent.strokes || []);
      setTexts(props.boardContent.texts || []);
      
      // Load images - reconstruct HTMLImageElement from Supabase Storage URLs
      const loadImages = async () => {
        const imagePromises = (props.boardContent.images || []).map(async (imgData) => {
          if (imgData.src && !imgData.error) {
            return new Promise<{ id: string, image: HTMLImageElement, x: number, y: number, width?: number, height?: number, rotation?: number, timestamp: number, error?: boolean }>((resolve) => {
              const img = new window.Image();
              img.crossOrigin = 'anonymous'; // Allow CORS for Supabase Storage
              img.onload = () => {
                resolve({
                  id: imgData.id,
                  image: img,
                  x: imgData.x,
                  y: imgData.y,
                  width: imgData.width,
                  height: imgData.height,
                  rotation: imgData.rotation,
                  timestamp: imgData.timestamp,
                  error: false
                });
              };
              img.onerror = () => {
                console.error('Failed to load image from storage:', imgData.src);
                resolve({
                  id: imgData.id,
                  image: null,
                  x: imgData.x,
                  y: imgData.y,
                  width: imgData.width,
                  height: imgData.height,
                  rotation: imgData.rotation,
                  timestamp: imgData.timestamp,
                  error: true
                });
              };
              img.src = imgData.src;
            });
          } else {
            // Handle images without src or with errors
            return {
              id: imgData.id,
              image: null,
              x: imgData.x,
              y: imgData.y,
              width: imgData.width,
              height: imgData.height,
              rotation: imgData.rotation,
              timestamp: imgData.timestamp,
              error: true
            };
          }
        });
        
        const loadedImages = await Promise.all(imagePromises);
        setImages(loadedImages);
      };
      
      loadImages();
      lastBoardIdRef.current = props.boardContent.id;
    }
  }, [props.boardContent]);

  // Clamp stage position so you can't pan outside the board
  function clampStagePos(pos: {x: number, y: number}) {
    const minX = Math.min(0, viewport.width - boardWidth);
    const minY = Math.min(0, viewport.height - boardHeight);
    const maxX = 0;
    const maxY = 0;
    return {
      x: clamp(pos.x, minX, maxX),
      y: clamp(pos.y, minY, maxY)
    };
  }

  // Mouse down: start drawing (brush tool) or panning (hand tool)
  const handleMouseDown = (e: any) => {
    if (props.selectedTool === 'hand') {
      setIsDragging(true);
      setLastPos({
        x: e.evt.clientX,
        y: e.evt.clientY
      });
    } else if (props.selectedTool === 'draw') {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      setDrawing(true);
      const id = Date.now().toString();
      setCurrentStroke({
        id,
        points: [pointer.x - stagePos.x, pointer.y - stagePos.y],
        color: props.brushColor,
        size: props.brushSize,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        timestamp: Date.now()
      });
    }
  };

  // Mouse move: update stage position (hand tool) or add points (brush tool)
  const handleMouseMove = (e: any) => {
    if (props.selectedTool === 'hand' && isDragging && lastPos) {
      const dx = e.evt.clientX - lastPos.x;
      const dy = e.evt.clientY - lastPos.y;
      setStagePos(prev => clampStagePos({ x: prev.x + dx, y: prev.y + dy }));
      setLastPos({ x: e.evt.clientX, y: e.evt.clientY });
    } else if (props.selectedTool === 'draw' && drawing && currentStroke) {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      setCurrentStroke({
        ...currentStroke,
        points: [...currentStroke.points, pointer.x - stagePos.x, pointer.y - stagePos.y]
      });
    }
  };

  // Mouse up: stop drawing (brush tool) or panning (hand tool)
  const handleMouseUp = () => {
    if (props.selectedTool === 'hand') {
      setIsDragging(false);
      setLastPos(null);
    } else if (props.selectedTool === 'draw' && drawing && currentStroke) {
      // Calculate bounding box for the stroke
      const xs = currentStroke.points.filter((_, i) => i % 2 === 0);
      const ys = currentStroke.points.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      
      // Ensure the new stroke gets a timestamp newer than all existing items
      const imageTimestamps = images.map(img => img.timestamp);
      const strokeTimestamps = strokes.map(stroke => stroke.timestamp);
      const allTimestamps = [...imageTimestamps, ...strokeTimestamps];
      
      // If no existing items, use current time, otherwise use max + 1
      const maxTimestamp = allTimestamps.length > 0 ? Math.max(...allTimestamps) : Date.now();
      const newTimestamp = maxTimestamp + 1;
      
      console.log('Adding stroke with timestamp:', newTimestamp, 'max existing:', maxTimestamp);
      
      pushToUndoStack();
      setStrokes(prev => [
        ...prev,
        {
          ...currentStroke,
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          points: currentStroke.points.map((p, i) => i % 2 === 0 ? p - minX : p - minY),
          timestamp: newTimestamp
        }
      ]);
      setDrawing(false);
      setCurrentStroke(null);
    }
  };

  // Select image (select tool only)
  const handleImageClick = (id: string) => {
    if (props.selectedTool === 'select') {
      setSelectedIds(prev => {
        if (prev.some(sel => sel.id === id && sel.type === 'image')) {
          // Remove from selection
          return prev.filter(sel => !(sel.id === id && sel.type === 'image'));
        } else {
          // Add to selection
          return [...prev, { id, type: 'image' }];
        }
      });
    }
  };

  // Select stroke (select tool only)
  const handleStrokeClick = (id: string) => {
    if (props.selectedTool === 'select') {
      setSelectedIds(prev => {
        if (prev.some(sel => sel.id === id && sel.type === 'stroke')) {
          // Remove from selection
          return prev.filter(sel => !(sel.id === id && sel.type === 'stroke'));
        } else {
          // Add to selection
          return [...prev, { id, type: 'stroke' }];
        }
      });
    }
  };

  // Add text tool logic
  const handleStageClick = (e: any) => {
    if (props.selectedTool === 'text') {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const id = Date.now().toString();
      pushToUndoStack();
      setTexts(prev => [
        ...prev,
        {
          id,
          text: 'Add text',
          x: pointer.x - stagePos.x,
          y: pointer.y - stagePos.y,
          color: props.textColor || '#FF0000',
          fontSize: 32,
          rotation: 0,
          timestamp: Date.now()
        }
      ]);
      // Select the new text and switch to select tool
      setSelectedIds([{ id, type: 'text' }]);
      if (props.onTextAdded) props.onTextAdded();
      return;
    }
    if (props.selectedTool === 'select' && e.target === e.target.getStage()) {
      setSelectedIds([]);
    }
  };

  // Selection helpers
  const isSelected = (id: string, type: 'image' | 'stroke' | 'text') => selectedIds.some(sel => sel.id === id && sel.type === type);

  // Handle click on image/stroke
  const handleItemClick = (id: string, type: 'image' | 'stroke' | 'text', evt: any) => {
    if (props.selectedTool !== 'select') return;
    const isMulti = evt.evt.shiftKey || evt.evt.ctrlKey || evt.evt.metaKey;
    if (isMulti) {
      setSelectedIds(prev => {
        if (prev.some(sel => sel.id === id && sel.type === type)) {
          // Remove from selection
          return prev.filter(sel => !(sel.id === id && sel.type === type));
        } else {
          // Add to selection
          return [...prev, { id, type }];
        }
      });
    } else {
      setSelectedIds([{ id, type }]);
    }
  };

  // Multi-select: start selection rectangle
  const handleStageMouseDown = (e: any) => {
    if (props.selectedTool === 'select' && e.target === e.target.getStage()) {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      setSelectionStart(pointer);
      setSelectionRect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
      setSelectedIds([]);
    } else {
      handleMouseDown(e);
    }
  };

  // Multi-select: update selection rectangle
  const handleStageMouseMove = (e: any) => {
    if (selectionStart && selectionRect) {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      setSelectionRect({
        x: Math.min(selectionStart.x, pointer.x),
        y: Math.min(selectionStart.y, pointer.y),
        width: Math.abs(pointer.x - selectionStart.x),
        height: Math.abs(pointer.y - selectionStart.y)
      });
    } else {
      handleMouseMove(e);
    }
  };

  // Multi-select: finish selection rectangle
  const handleStageMouseUp = (e: any) => {
    if (selectionRect && selectionStart) {
      // Find all items that intersect the selection rectangle
      const selected: Array<{ id: string, type: 'image' | 'stroke' | 'text' }> = [];
      images.forEach(img => {
        if (
          img.x + (img.width || 200) > selectionRect.x - stagePos.x &&
          img.x < selectionRect.x - stagePos.x + selectionRect.width &&
          img.y + (img.height || 200) > selectionRect.y - stagePos.y &&
          img.y < selectionRect.y - stagePos.y + selectionRect.height
        ) {
          selected.push({ id: img.id, type: 'image' });
        }
      });
      strokes.forEach(stroke => {
        if (
          stroke.x + stroke.width > selectionRect.x - stagePos.x &&
          stroke.x < selectionRect.x - stagePos.x + selectionRect.width &&
          stroke.y + stroke.height > selectionRect.y - stagePos.y &&
          stroke.y < selectionRect.y - stagePos.y + selectionRect.height
        ) {
          selected.push({ id: stroke.id, type: 'stroke' });
        }
      });
      texts.forEach(txt => {
        if (
          txt.x + txt.fontSize > selectionRect.x - stagePos.x &&
          txt.x < selectionRect.x - stagePos.x + selectionRect.width &&
          txt.y + txt.fontSize > selectionRect.y - stagePos.y &&
          txt.y < selectionRect.y - stagePos.y + selectionRect.height
        ) {
          selected.push({ id: txt.id, type: 'text' });
        }
      });
      setSelectedIds(selected);
      setSelectionRect(null);
      setSelectionStart(null);
    } else {
      handleMouseUp();
    }
  };

  // Multi-select: drag group
  const handleGroupDragStart = (e: any, id: string, type: 'image' | 'stroke' | 'text') => {
    if (props.selectedTool === 'select' && isSelected(id, type)) {
      const items = selectedIds.map(sel => {
        if (sel.type === 'image') {
          const img = images.find(i => i.id === sel.id);
          return img ? { id: sel.id, type: 'image', x: img.x, y: img.y } : null;
        } else if (sel.type === 'stroke') {
          const stroke = strokes.find(s => s.id === sel.id);
          return stroke ? { id: sel.id, type: 'stroke', x: stroke.x, y: stroke.y } : null;
        } else {
          const txt = texts.find(t => t.id === sel.id);
          return txt ? { id: sel.id, type: 'text', x: txt.x, y: txt.y } : null;
        }
      }).filter(Boolean) as Array<{ id: string, type: 'image' | 'stroke' | 'text', x: number, y: number }>; 
      setGroupDragStart({ x: e.target.x(), y: e.target.y(), items });
    }
  };
  const handleGroupDragMove = (e: any, id: string, type: 'image' | 'stroke' | 'text') => {
    if (groupDragStart) {
      const dx = e.target.x() - groupDragStart.x;
      const dy = e.target.y() - groupDragStart.y;
      setImages(prev => prev.map(img => {
        const sel = selectedIds.find(s => s.id === img.id && s.type === 'image');
        if (sel) {
          const orig = groupDragStart.items.find(i => i.id === img.id && i.type === 'image');
          if (orig) return { ...img, x: orig.x + dx, y: orig.y + dy };
        }
        return img;
      }));
      setStrokes(prev => prev.map(stroke => {
        const sel = selectedIds.find(s => s.id === stroke.id && s.type === 'stroke');
        if (sel) {
          const orig = groupDragStart.items.find(i => i.id === stroke.id && i.type === 'stroke');
          if (orig) return { ...stroke, x: orig.x + dx, y: orig.y + dy };
        }
        return stroke;
      }));
      setTexts(prev => prev.map(txt => {
        const sel = selectedIds.find(s => s.id === txt.id && s.type === 'text');
        if (sel) {
          const orig = groupDragStart.items.find(i => i.id === txt.id && i.type === 'text');
          if (orig) return { ...txt, x: orig.x + dx, y: orig.y + dy };
        }
        return txt;
      }));
    }
  };
  const handleGroupDragEnd = () => {
    setGroupDragStart(null);
  };

  // Update image position/size/rotation after transform
  const handleTransformEndImage = (id: string, node: any) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    const x = node.x();
    const y = node.y();
    const width = Math.max(20, node.width() * scaleX);
    const height = Math.max(20, node.height() * scaleY);
    setImages(prev => prev.map(img =>
      img.id === id
        ? { ...img, x, y, width, height, rotation }
        : img
    ));
    node.scaleX(1);
    node.scaleY(1);
  };

  // Update stroke position/size/rotation after transform
  const handleTransformEndStroke = (id: string, node: any) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    const x = node.x();
    const y = node.y();
    setStrokes(prev => prev.map(stroke =>
      stroke.id === id
        ? {
            ...stroke,
            x,
            y,
            width: Math.max(20, stroke.width * scaleX),
            height: Math.max(20, stroke.height * scaleY),
            points: stroke.points.map((p, i) => i % 2 === 0 ? p * scaleX : p * scaleY),
            rotation
          }
        : stroke
    ));
    node.scaleX(1);
    node.scaleY(1);
  };

  // Attach Transformer to all selected nodes
  React.useEffect(() => {
    if (transformerRef.current && selectedIds.length > 0) {
      const nodes = selectedIds.map(sel => {
        if (sel.type === 'image') {
          return layerRef.current.findOne(`#img-${sel.id}`);
        } else if (sel.type === 'stroke') {
          return layerRef.current.findOne(`#stroke-${sel.id}`);
        } else {
          return layerRef.current.findOne(`#text-${sel.id}`);
        }
      }).filter(Boolean);
      transformerRef.current.nodes(nodes);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [selectedIds, images, strokes, texts]);

  // Delete selected items
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        pushToUndoStack();
        setImages(prev => prev.filter(img => !selectedIds.some(sel => sel.id === img.id && sel.type === 'image')));
        setStrokes(prev => prev.filter(stroke => !selectedIds.some(sel => sel.id === stroke.id && sel.type === 'stroke')));
        setTexts(prev => prev.filter(txt => !selectedIds.some(sel => sel.id === txt.id && sel.type === 'text')));
        setSelectedIds([]);
      }
      // Allow deleting the bounding box with Delete/Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && sketchBox) {
        setSketchBox(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, sketchBox, pushToUndoStack]);

  // Debug: log the timestamps
  console.log('All items timestamps:', images.map(item => ({ id: item.id, type: 'image', timestamp: item.timestamp })).concat(strokes.map(item => ({ id: item.id, type: 'stroke', timestamp: item.timestamp }))));

  // Inline text editing logic (Fabric.js style, single textarea, no flicker)
  const handleTextDblClick = (txt: any) => {
    if (editingText) return; // Only one at a time
    setEditingText({
      id: txt.id,
      value: txt.text,
      x: txt.x,
      y: txt.y,
      color: txt.color,
      fontSize: txt.fontSize,
      rotation: txt.rotation || 0,
    });
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    }, 0);
  };
  const handleTextareaBlur = () => {
    if (editingText) {
      pushToUndoStack();
      setTexts(prev => prev.map(t => t.id === editingText.id ? { ...t, text: editingText.value } : t));
      setEditingText(null);
    }
  };
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setEditingText(null);
    }
  };

  // Handle click outside textarea to close editing
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editingText && textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        handleTextareaBlur();
      }
    };

    if (editingText) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [editingText]);

  // Handle mouse events for sketch mode bounding box
  const handleSketchBoxMouseDown = (e: any) => {
    if (!props.sketchModeActive) return;
    if (sketchBox) return; // Only one at a time
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    setSketchBoxDrawing(true);
    // Adjust for stage position (panning)
    const startX = pointer.x - stagePos.x;
    const startY = pointer.y - stagePos.y;
    setSketchBoxStart({ x: startX, y: startY });
    setSketchBox({ x: startX, y: startY, width: 1, height: 1 });
  };
  const handleSketchBoxMouseMove = (e: any) => {
    if (!props.sketchModeActive) return;
    if (!sketchBoxDrawing || !sketchBoxStart) return;
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    // Adjust for stage position (panning)
    const currX = pointer.x - stagePos.x;
    const currY = pointer.y - stagePos.y;
    const x = Math.min(sketchBoxStart.x, currX);
    const y = Math.min(sketchBoxStart.y, currY);
    const width = Math.abs(currX - sketchBoxStart.x);
    const height = Math.abs(currY - sketchBoxStart.y);
    setSketchBox({ x, y, width, height });
  };
  const handleSketchBoxMouseUp = (e: any) => {
    if (!props.sketchModeActive) return;
    if (!sketchBoxDrawing) return;
    setSketchBoxDrawing(false);
    setSketchBoxStart(null);
  };
  // Handle transform (move/resize) of bounding box
  const handleSketchBoxTransform = (e: any) => {
    if (!props.sketchModeActive) return;
    const node = sketchBoxRef.current;
    if (!node) return;
    const x = node.x();
    const y = node.y();
    const width = Math.max(10, node.width() * node.scaleX());
    const height = Math.max(10, node.height() * node.scaleY());
    setSketchBox({ x, y, width, height });
    node.scaleX(1);
    node.scaleY(1);
  };

  // Add a function to clear the bounding box
  const clearSketchBox = () => {
    setSketchBox(null);
    setSketchBoxDrawing(false);
    setSketchBoxStart(null);
  };

  // Render mode bounding box handlers (completely independent)
  const handleRenderBoxMouseDown = (e: any) => {
    if (!props.renderModeActive) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    
    setRenderBoxDrawing(true);
    setRenderBoxStart({ x: pointer.x - stagePos.x, y: pointer.y - stagePos.y });
    
    // Clear any existing render box
    setRenderBox(null);
  };

  const handleRenderBoxMouseMove = (e: any) => {
    if (!props.renderModeActive || !renderBoxDrawing || !renderBoxStart) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    
    const currentX = pointer.x - stagePos.x;
    const currentY = pointer.y - stagePos.y;
    
    const x = Math.min(renderBoxStart.x, currentX);
    const y = Math.min(renderBoxStart.y, currentY);
    const width = Math.abs(currentX - renderBoxStart.x);
    const height = Math.abs(currentY - renderBoxStart.y);
    
    setRenderBox({ x, y, width, height });
  };

  const handleRenderBoxMouseUp = (e: any) => {
    if (!props.renderModeActive || !renderBoxDrawing) return;
    e.evt.preventDefault();
    setRenderBoxDrawing(false);
    setRenderBoxStart(null);
  };

  const handleRenderBoxTransform = (e: any) => {
    if (!props.renderModeActive) return;
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    
    setRenderBox({
      x: node.x(),
      y: node.y(),
      width: Math.max(20, node.width() * scaleX),
      height: Math.max(20, node.height() * scaleY)
    });
    
    node.scaleX(1);
    node.scaleY(1);
  };

  const clearRenderBox = () => {
    setRenderBox(null);
    setRenderBoxDrawing(false);
    setRenderBoxStart(null);
  };

    return (
    <div className={`fixed inset-0 z-0 overflow-hidden ${props.className || ''}`} style={{ background: '#1E1E1E' }}>
      <Stage
        width={viewport.width}
        height={viewport.height}
        ref={stageRef}
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 0, cursor: props.selectedTool === 'hand' && isDragging ? 'grabbing' : props.selectedTool === 'hand' ? 'grab' : props.selectedTool === 'draw' ? 'crosshair' : 'default' }}
        x={stagePos.x}
        y={stagePos.y}
        draggable={false}
        onMouseDown={props.sketchModeActive ? handleSketchBoxMouseDown : props.renderModeActive ? handleRenderBoxMouseDown : handleStageMouseDown}
        onTouchStart={props.sketchModeActive ? handleSketchBoxMouseDown : props.renderModeActive ? handleRenderBoxMouseDown : handleStageMouseDown}
        onMouseMove={props.sketchModeActive ? handleSketchBoxMouseMove : props.renderModeActive ? handleRenderBoxMouseMove : handleStageMouseMove}
        onTouchMove={props.sketchModeActive ? handleSketchBoxMouseMove : props.renderModeActive ? handleRenderBoxMouseMove : handleStageMouseMove}
        onMouseUp={props.sketchModeActive ? handleSketchBoxMouseUp : props.renderModeActive ? handleRenderBoxMouseUp : handleStageMouseUp}
        onTouchEnd={props.sketchModeActive ? handleSketchBoxMouseUp : props.renderModeActive ? handleRenderBoxMouseUp : handleStageMouseUp}
        onClick={handleStageClick}
      >
        <Layer ref={layerRef} width={boardWidth} height={boardHeight}>
          {/* Draw grid lines */}
          {gridLines.map((line, i) => (
            <Line
              key={i}
              points={line.points}
              stroke="#333"
              strokeWidth={0.5}
              listening={false}
            />
          ))}
          
          {/* Show empty state message when no board is selected */}
          {!props.boardContent && (
            <KonvaText
              x={boardWidth / 2 - 200}
              y={boardHeight / 2 - 50}
              text="Select a board to start creating"
              fontSize={24}
              fill="#666"
              fontFamily="Gilroy, sans-serif"
              align="center"
              listening={false}
            />
          )}
          
          {/* Render all images first (oldest to newest) */}
          {images
            .slice()
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(img => (
              img.error ? (
                <Rect
                  key={img.id}
                  x={img.x}
                  y={img.y}
                  width={img.width || 200}
                  height={img.height || 200}
                  fill="#ff3333"
                  cornerRadius={16}
                  shadowBlur={8}
                  shadowColor="#000"
                  stroke="#fff"
                  strokeWidth={2}
                />
              ) : (
                <KonvaImage
                  key={img.id}
                  id={`img-${img.id}`}
                  image={img.image}
                  x={img.x}
                  y={img.y}
                  width={img.width || 200}
                  height={img.height || 200}
                  rotation={img.rotation || 0}
                  draggable={props.selectedTool === 'select' && isSelected(img.id, 'image')}
                  onClick={evt => handleItemClick(img.id, 'image', evt)}
                  onTap={evt => handleItemClick(img.id, 'image', evt)}
                  onDragEnd={e => {
                    pushToUndoStack();
                    const { x, y } = e.target.position();
                    setImages(prev => prev.map(im => im.id === img.id ? { ...im, x, y } : im));
                    handleGroupDragEnd();
                  }}
                  onTransformEnd={e => handleTransformEndImage(img.id, e.target)}
                  onDragStart={e => handleGroupDragStart(e, img.id, 'image')}
                  onDragMove={e => handleGroupDragMove(e, img.id, 'image')}
                />
              )
            ))}
          {/* Render all texts after images (oldest to newest) */}
          {texts
            .slice()
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(txt => (
              <KonvaText
                key={txt.id}
                id={`text-${txt.id}`}
                text={txt.text}
                x={txt.x}
                y={txt.y}
                fontSize={txt.fontSize}
                fill={txt.color}
                draggable={props.selectedTool === 'select' && isSelected(txt.id, 'text')}
                rotation={txt.rotation}
                visible={!(editingText && editingText.id === txt.id)}
                onClick={evt => handleItemClick(txt.id, 'text', evt)}
                onTap={evt => handleItemClick(txt.id, 'text', evt)}
                onDblClick={() => handleTextDblClick(txt)}
                onDblTap={() => handleTextDblClick(txt)}
                onDragEnd={e => {
                  pushToUndoStack();
                  const { x, y } = e.target.position();
                  setTexts(prev => prev.map(t => t.id === txt.id ? { ...t, x, y } : t));
                  handleGroupDragEnd();
                }}
                onTransformEnd={e => {
                  pushToUndoStack();
                  const node = e.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  const rotation = node.rotation();
                  const x = node.x();
                  const y = node.y();
                  setTexts(prev => prev.map(t =>
                    t.id === txt.id
                      ? { ...t, x, y, fontSize: Math.max(10, t.fontSize * scaleY), rotation }
                      : t
                  ));
                  node.scaleX(1);
                  node.scaleY(1);
                }}
                onDragStart={e => handleGroupDragStart(e, txt.id, 'text')}
                onDragMove={e => handleGroupDragMove(e, txt.id, 'text')}
              />
            ))}
          {/* Render all strokes after images (oldest to newest) */}
          {strokes
            .slice()
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(stroke => (
              <Line
                key={stroke.id}
                id={`stroke-${stroke.id}`}
                points={stroke.points}
                x={stroke.x}
                y={stroke.y}
                stroke={stroke.color}
                strokeWidth={stroke.size}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                draggable={props.selectedTool === 'select' && isSelected(stroke.id, 'stroke')}
                rotation={stroke.rotation}
                onClick={evt => handleItemClick(stroke.id, 'stroke', evt)}
                onTap={evt => handleItemClick(stroke.id, 'stroke', evt)}
                onDragEnd={e => {
                  pushToUndoStack();
                  const { x, y } = e.target.position();
                  setStrokes(prev => prev.map(s => s.id === stroke.id ? { ...s, x, y } : s));
                  handleGroupDragEnd();
                }}
                onTransformEnd={e => handleTransformEndStroke(stroke.id, e.target)}
                onDragStart={e => handleGroupDragStart(e, stroke.id, 'stroke')}
                onDragMove={e => handleGroupDragMove(e, stroke.id, 'stroke')}
              />
            ))}
          {/* Render current stroke live while drawing */}
          {currentStroke && props.selectedTool === 'draw' && (
            <Line
              key="current"
              points={currentStroke.points}
              x={currentStroke.x}
              y={currentStroke.y}
              stroke={currentStroke.color}
              strokeWidth={currentStroke.size}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              draggable={false}
              listening={false}
            />
          )}
          {/* Selection handles (Miro-style) */}
          {selectedIds.length > 0 && props.selectedTool === 'select' && (
            <Transformer
              ref={transformerRef}
              rotateEnabled={true}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'middle-left', 'middle-right']}
              borderStroke="#E1FF00"
              anchorStroke="#E1FF00"
              anchorFill="#fff"
              anchorSize={8}
              anchorCornerRadius={4}
              anchorStrokeWidth={2}
              anchorDash={[2, 2]}
              boundBoxFunc={(oldBox, newBox) => {
                // Limit resize to minimum size
                if (newBox.width < 20 || newBox.height < 20) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          )}
          {/* Selection rectangle */}
          {selectionRect && (
            <Line
              points={[
                selectionRect.x - stagePos.x, selectionRect.y - stagePos.y,
                selectionRect.x - stagePos.x + selectionRect.width, selectionRect.y - stagePos.y,
                selectionRect.x - stagePos.x + selectionRect.width, selectionRect.y - stagePos.y + selectionRect.height,
                selectionRect.x - stagePos.x, selectionRect.y - stagePos.y + selectionRect.height,
                selectionRect.x - stagePos.x, selectionRect.y - stagePos.y
              ]}
              stroke="#E1FF00"
              strokeWidth={1.5}
              dash={[4, 4]}
              closed={false}
              listening={false}
            />
          )}
          {/* Render sketch bounding box if in sketch mode */}
          {props.sketchModeActive && sketchBox && (
            <>
              <Rect
                ref={sketchBoxRef}
                x={sketchBox.x}
                y={sketchBox.y}
                width={sketchBox.width}
                height={sketchBox.height}
                stroke="#E1FF00"
                strokeWidth={2}
                dash={[6, 4]}
                fill="rgba(0,0,0,0.0)"
                draggable
                onTransformEnd={handleSketchBoxTransform}
                onDragEnd={handleSketchBoxTransform}
              />
              <Transformer
                ref={sketchBoxTransformerRef}
                nodes={sketchBoxRef.current ? [sketchBoxRef.current] : []}
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
                borderStroke="#E1FF00"
                anchorStroke="#E1FF00"
                anchorFill="#fff"
                anchorSize={8}
                anchorCornerRadius={4}
                anchorStrokeWidth={2}
                anchorDash={[2, 2]}
              />
            </>
          )}
          {/* Render render bounding box if in render mode */}
          {props.renderModeActive && renderBox && (
            <>
              <Rect
                ref={renderBoxRef}
                x={renderBox.x}
                y={renderBox.y}
                width={renderBox.width}
                height={renderBox.height}
                stroke="#E1FF00"
                strokeWidth={2}
                dash={[6, 4]}
                fill="rgba(0,0,0,0.0)"
                draggable
                onTransformEnd={handleRenderBoxTransform}
                onDragEnd={handleRenderBoxTransform}
              />
              <Transformer
                ref={renderBoxTransformerRef}
                nodes={renderBoxRef.current ? [renderBoxRef.current] : []}
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
                borderStroke="#E1FF00"
                anchorStroke="#E1FF00"
                anchorFill="#fff"
                anchorSize={8}
                anchorCornerRadius={4}
                anchorStrokeWidth={2}
                anchorDash={[2, 2]}
              />
            </>
          )}
        </Layer>
      </Stage>
      {/* Textarea overlay for editing - positioned outside Konva Stage */}
      {editingText && (
        <textarea
          ref={textareaRef}
          value={editingText.value}
          onChange={e => setEditingText(editingText ? { ...editingText, value: e.target.value } : null)}
          onBlur={handleTextareaBlur}
          onKeyDown={handleTextareaKeyDown}
          style={{ 
            position: 'absolute',
            left: editingText.x + stagePos.x,
            top: editingText.y + stagePos.y,
            fontSize: editingText.fontSize,
            color: editingText.color,
            background: 'transparent',
            border: '1.5px solid #E1FF00',
            borderRadius: 6,
            padding: '2px 8px',
            zIndex: 1000,
            outline: 'none',
            minWidth: Math.max(80, editingText.value.length * 18),
            maxWidth: 600,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'normal',
            fontStyle: 'normal',
            boxShadow: '0 0 0 2px rgba(225,255,0,0.15)',
            caretColor: '#E1FF00',
            letterSpacing: 'normal',
            lineHeight: 1.1,
            textAlign: 'left',
            transition: 'border 0.1s',
            resize: 'none',
            whiteSpace: 'pre',
            transform: editingText.rotation ? `rotate(${editingText.rotation}deg)` : undefined,
          }}
          autoFocus
          rows={1}
          spellCheck={false}
        />
      )}
      </div>
    );
});
