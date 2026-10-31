'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  RotateCcw, 
  Layers, 
  Sparkles,
  Scissors,
  Paintbrush,
  Check,
  X,
  ChevronRight,
  Shield,
  Activity,
  Sliders,
  Maximize2
} from 'lucide-react';
import {
  DentalSurface,
  ToothAxes,
  detectDentalSurface,
  doesNormalMatchSurface,
  doesPositionMatchRoot,
  getAnatomicalDepthRatio,
  projectOnToothAxis,
} from './dentalAnatomy';

// ── Türk Standart FDI Diş İsimleri Sözlüğü ──────────────────────────────────
export const TOOTH_NAMES: Record<number, string> = {
  11: 'Sağ Üst Santral Kesici',
  12: 'Sağ Üst Lateral Kesici',
  13: 'Sağ Üst Kanin (Köpek Dişi)',
  14: 'Sağ Üst 1. Premolar (Küçük Azı)',
  15: 'Sağ Üst 2. Premolar (Küçük Azı)',
  16: 'Sağ Üst 1. Molar (Büyük Azı)',
  17: 'Sağ Üst 2. Molar (Büyük Azı)',
  18: 'Sağ Üst 3. Molar (Yirmi Yaş Dişi)',

  21: 'Sol Üst Santral Kesici',
  22: 'Sol Üst Lateral Kesici',
  23: 'Sol Üst Kanin (Köpek Dişi)',
  24: 'Sol Üst 1. Premolar (Küçük Azı)',
  25: 'Sol Üst 2. Premolar (Küçük Azı)',
  26: 'Sol Üst 1. Molar (Büyük Azı)',
  27: 'Sol Üst 2. Molar (Büyük Azı)',
  28: 'Sol Üst 3. Molar (Yirmi Yaş Dişi)',

  31: 'Sol Alt Santral Kesici',
  32: 'Sol Alt Lateral Kesici',
  33: 'Sol Alt Kanin (Köpek Dişi)',
  34: 'Sol Alt 1. Premolar (Küçük Azı)',
  35: 'Sol Alt 2. Premolar (Küçük Azı)',
  36: 'Sol Alt 1. Molar (Büyük Azı)',
  37: 'Sol Alt 2. Molar (Büyük Azı)',
  38: 'Sol Alt 3. Molar (Yirmi Yaş Dişi)',

  41: 'Sağ Alt Santral Kesici',
  42: 'Sağ Alt Lateral Kesici',
  43: 'Sağ Alt Kanin (Köpek Dişi)',
  44: 'Sağ Alt 1. Premolar (Küçük Azı)',
  45: 'Sağ Alt 2. Premolar (Küçük Azı)',
  46: 'Sağ Alt 1. Molar (Büyük Azı)',
  47: 'Sağ Alt 2. Molar (Büyük Azı)',
  48: 'Sağ Alt 3. Molar (Yirmi Yaş Dişi)',
};

// Dişin çok köklü olup olmadığını belirleme
function isMultiRooted(fdi: number): boolean {
  const num = fdi % 10;
  return num >= 4; // Premolar ve molarlar
}

function getToothRoots(fdi: number): string[] {
  const isUpper = fdi < 30;
  const num = fdi % 10;
  if (num >= 6) {
    // Molar
    return isUpper ? ['Mezyobukkal Kök', 'Distobukkal Kök', 'Palatinal Kök'] : ['Mezyal Kök', 'Distal Kök'];
  }
  if (num === 4 || num === 5) {
    // Premolar
    return isUpper ? ['Bukkal Kök', 'Palatinal Kök'] : ['Tek Kök'];
  }
  return ['Tek Kök (Apikal)'];
}

export interface DefectMarker {
  id: string;
  fdi: number;
  position: [number, number, number];
  normal: [number, number, number];
  type: 'curuk' | 'catlak' | 'lezyon';
}

interface Odontogram3DProps {
  jawFilter?: 'all' | 'upper' | 'lower';
  selectedTeeth: number[];
  toothDrafts: Record<string, any[]>;
  onToothClick: (toothNumber: number, event: React.MouseEvent) => void;
  onContextMenu?: (toothNumber: number, event: React.MouseEvent) => void;
  height?: number | string;
  toothSurfaces?: Record<number, string[]>;
  onUpdateSurfaces?: (toothNumber: number, surfaces: string[]) => void;
  toothSections?: Record<number, string>;
  onUpdateSection?: (toothNumber: number, section: string | null) => void;
  defectMarkers?: DefectMarker[];
  onAddDefectMarker?: (marker: DefectMarker) => void;
  onRemoveDefectMarker?: (id: string) => void;
  onClearAllSelections?: () => void;
  onDropTreatment?: (targets: number[], data: any) => void;
}

export default function Odontogram3D({
  jawFilter = 'all',
  selectedTeeth,
  toothDrafts,
  onToothClick,
  onContextMenu,
  height = 480,
  toothSurfaces = {},
  onUpdateSurfaces,
  toothSections = {},
  onUpdateSection,
  defectMarkers = [],
  onAddDefectMarker,
  onRemoveDefectMarker,
  onClearAllSelections,
  onDropTreatment,
}: Odontogram3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // HUD Panel Kapatma/Açma Durumu
  const [isHudVisible, setIsHudVisible] = useState(true);

  // Sürükle-Bırak Hedef Diş
  const [dropTargetTooth, setDropTargetTooth] = useState<number | null>(null);

  // Renk Lejantı Açık/Kapalı
  const [showLegend, setShowLegend] = useState(false);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Dark / Light Mode Takibi ──────────────────────────────────────────────
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const updateTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      setIsLight(theme === 'light');
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const themeStyles = useMemo(() => {
    if (isLight) {
      return {
        isLight: true,
        bg: '#f1f5f9',
        cardBg: '#ffffff',
        subCardBg: '#f8fafc',
        border: '#cbd5e1',
        borderStrong: '#94a3b8',
        textPrimary: '#0f172a',
        textSecondary: '#475569',
        textMuted: '#64748b',
        btnBg: '#ffffff',
        btnBorder: '#cbd5e1',
        btnText: '#1e293b',
        btnHover: '#f1f5f9',
        compassBg: '#ffffff',
        compassBorder: '#3b82f6',
        compassPadBg: '#f1f5f9',
        compassPadBorder: '#cbd5e1',
        compassPadText: '#334155',
        compassPresetBg: '#eff6ff',
        compassPresetBorder: '#bfdbfe',
        compassPresetText: '#1d4ed8',
        bottomBarBg: '#ffffff',
        bottomBarBorder: '#cbd5e1',
        bottomBarText: '#334155',
        bottomBarStrong: '#1d4ed8',
        tooltipBg: '#ffffff',
        tooltipBorder: '#3b82f6',
        tooltipText: '#0f172a',
        shadow: '0 4px 16px rgba(0,0,0,0.12)',
      };
    }
    return {
      isLight: false,
      bg: '#0b1120',
      cardBg: '#1e293b',
      subCardBg: '#0f172a',
      border: '#334155',
      borderStrong: '#475569',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      btnBg: '#0f172a',
      btnBorder: '#334155',
      btnText: '#cbd5e1',
      btnHover: '#1e293b',
      compassBg: '#1e293b',
      compassBorder: '#3b82f6',
      compassPadBg: '#0f172a',
      compassPadBorder: '#334155',
      compassPadText: '#94a3b8',
      compassPresetBg: '#0f172a',
      compassPresetBorder: '#334155',
      compassPresetText: '#93c5fd',
      bottomBarBg: '#0f172a',
      bottomBarBorder: '#1e293b',
      bottomBarText: '#cbd5e1',
      bottomBarStrong: '#38bdf8',
      tooltipBg: '#0f172a',
      tooltipBorder: '#3b82f6',
      tooltipText: '#f8fafc',
      shadow: '0 6px 20px rgba(0,0,0,0.6)',
    };
  }, [isLight]);

  // Layer Visibility Controls
  const [showBone, setShowBone] = useState(true);
  const [boneOpacity, setBoneOpacity] = useState(0.4);
  const [showPulp, setShowPulp] = useState(false);
  const [showCanal, setShowCanal] = useState(false);

  // ── Gelişmiş Araç Modları ─────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<'select' | 'brush' | 'clip'>('select');
  const [brushType, setBrushType] = useState<'curuk' | 'catlak' | 'lezyon'>('curuk');
  
  // Canlı Kesit (Clipping Plane) Slider
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipOffset, setClipOffset] = useState(50); // 0-100 arası
  const clippingPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.05));

  // Aktif odaklanan diş (HUD için)
  const activeTooth = useMemo(() => {
    if (selectedTeeth.length === 0) return null;
    return selectedTeeth[selectedTeeth.length - 1]; // En son seçilen diş
  }, [selectedTeeth]);

  // Hovered Tooth Info for UI Tooltip
  const [hoveredTooth, setHoveredTooth] = useState<{
    fdi: number;
    name: string;
    detectedSurface?: string | null;
    drafts?: any[];
    x: number;
    y: number;
  } | null>(null);

  // Internal Three.js references
  const threeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    teethMeshes: Map<number, THREE.Mesh>;
    boneMeshes: THREE.Mesh[];
    pulpMeshes: THREE.Mesh[];
    canalMeshes: THREE.Mesh[];
    markerMeshes: THREE.Mesh[];
    rootGroup: THREE.Group;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    animFrameId: number;
    hoveredMesh: THREE.Mesh | null;
  } | null>(null);

  // ── Yüzey Normalinden Yüzey (MODBL) Algılama ────────────────────────────────
  const detectSurfaceFromNormal = useCallback((
    fdi: number,
    normalModel: THREE.Vector3,
    axes: ToothAxes,
  ): DentalSurface => {
    return detectDentalSurface(fdi, [normalModel.x, normalModel.y, normalModel.z], axes);
  }, []);

  // ── Renkleri ve Yüzey/Bölüm Vurgularını 3D Mesh'lere Uygulama ──────────────
  const updateToothMaterials = useCallback(() => {
    if (!threeRef.current) return;
    const { teethMeshes, hoveredMesh } = threeRef.current;

    teethMeshes.forEach((mesh, fdi) => {
      const isSelected = selectedTeeth.includes(fdi);
      const isHovered = hoveredMesh === mesh;
      const drafts = toothDrafts[String(fdi)];
      const hasDraft = drafts && drafts.length > 0;
      const draftColor = hasDraft && drafts[0].color ? drafts[0].color : null;
      const surfaces = toothSurfaces[fdi] || [];
      const section = toothSections[fdi];

      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) return;

      // Drag over hedefi veya hover durumunda parlama
      if (dropTargetTooth === fdi) {
        mat.emissive.set('#10b981'); // Hedeflenen diş canlı zümrüt yeşili parlar
        mat.emissiveIntensity = 0.75;
      } else if (isHovered) {
        mat.emissive.set('#0284c7');
        mat.emissiveIntensity = 0.40;
      } else {
        mat.emissive.set('#000000');
        mat.emissiveIntensity = 0.0;
      }

      const geo = mesh.geometry as THREE.BufferGeometry;
      const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute;
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const normAttr = geo.getAttribute('normal') as THREE.BufferAttribute;

      if (!colorAttr || !posAttr || !normAttr) return;

      const colors = colorAttr.array as Float32Array;
      const vertexCount = mesh.userData.vertexCount || posAttr.count;
      const axes = mesh.userData.axes as ToothAxes | undefined;
      const minUpProjection = mesh.userData.minUpProjection as number | undefined;
      const maxUpProjection = mesh.userData.maxUpProjection as number | undefined;

      // Every ToothFairy tooth carries its own anatomical coordinate frame.
      // Without it, painting a guessed global region would be misleading.
      if (!axes || minUpProjection === undefined || maxUpProjection === undefined) return;

      let draftR = 0.97, draftG = 0.98, draftB = 0.99;
      if (draftColor) {
        const c = new THREE.Color(draftColor);
        draftR = c.r; draftG = c.g; draftB = c.b;
      }

      const hasSpecificSurfaces = surfaces.length > 0;
      const hasSpecificSection = !!section;

      for (let i = 0; i < vertexCount; i++) {
        const idx = i * 3;

        // 1. Diş seçili değilse:
        if (!isSelected) {
          if (draftColor) {
            colors[idx] = draftR;
            colors[idx + 1] = draftG;
            colors[idx + 2] = draftB;
          } else {
            // Doğal mine beyazı
            colors[idx] = 0.97;
            colors[idx + 1] = 0.98;
            colors[idx + 2] = 0.99;
          }
          continue;
        }

        // 2. Diş seçili ama özel bir yüzey veya anatomik bölüm seçilmemişse:
        // Tüm diş canlı mavi (#2563eb) ile boyanır
        if (!hasSpecificSurfaces && !hasSpecificSection) {
          colors[idx] = 0.145;
          colors[idx + 1] = 0.388;
          colors[idx + 2] = 0.922;
          continue;
        }

        // 3. Özel Yüzey veya Bölüm Seçildiyse:
        // Kural: Dişin temel seçim rengi (#2563eb) seçilmeyen kısımlarda aynen korunur;
        // sadece seçilen alanın (yüzey veya anatomik bölüm) rengi değişir!
        const position: [number, number, number] = [
          posAttr.getX(i),
          posAttr.getY(i),
          posAttr.getZ(i),
        ];
        const normal: [number, number, number] = [
          normAttr.getX(i),
          normAttr.getY(i),
          normAttr.getZ(i),
        ];
        const ratio = getAnatomicalDepthRatio(position, axes, minUpProjection, maxUpProjection);

        // Varsayılan: Diş seçim mavisi (#2563eb) korunur!
        let vertR = 0.145;
        let vertG = 0.388;
        let vertB = 0.922;

        // A) Anatomik Bölüm Vurgusu (Kuron / Kole / Kök / Çoklu Kökler)
        if (hasSpecificSection) {
          if (section === 'crown' && ratio < 0.44) {
            // Kuron: Kehribar / Altın Sarısı (#f59e0b)
            vertR = 0.961;
            vertG = 0.620;
            vertB = 0.043;
          } else if (section === 'cervical' && ratio >= 0.36 && ratio <= 0.60) {
            // Kole (Diş Boynu): Canlı Turuncu (#f97316)
            vertR = 0.976;
            vertG = 0.451;
            vertB = 0.086;
          } else if (section === 'root' && ratio > 0.48) {
            // Kök: Zümrüt Yeşili (#10b981)
            vertR = 0.063;
            vertG = 0.725;
            vertB = 0.506;
          } else if (section && section.includes('Kök') && ratio > 0.48) {
            // Çok köklü azılarda spesifik kök ayrımı: Mor (#8b5cf6)
            if (doesPositionMatchRoot(section, fdi, position, axes)) {
              // Mor (#8b5cf6)
              vertR = 0.545;
              vertG = 0.360;
              vertB = 0.965;
            }
          }
        }

        // B) MODBL Yüzey Vurgusu (Kuron bölgesinde ratio < 0.48)
        if (hasSpecificSurfaces && ratio < 0.48) {
          const surfaceMatch = surfaces.some(surface =>
            doesNormalMatchSurface(surface as DentalSurface, fdi, normal, axes),
          );

          if (surfaceMatch) {
            // Seçilen Yüzey: Parlak Turkuaz (#06b6d4)
            vertR = 0.024;
            vertG = 0.714;
            vertB = 0.831;
          }
        }

        colors[idx] = vertR;
        colors[idx + 1] = vertG;
        colors[idx + 2] = vertB;
      }

      colorAttr.needsUpdate = true;
    });
  }, [selectedTeeth, toothDrafts, toothSurfaces, toothSections, dropTargetTooth]);

  useEffect(() => {
    updateToothMaterials();
  }, [updateToothMaterials]);

  useEffect(() => {
    if (!threeRef.current) return;
    threeRef.current.teethMeshes.forEach((mesh, fdi) => {
      mesh.visible = jawFilter === 'all' || (jawFilter === 'upper' ? fdi < 30 : fdi >= 30);
    });
  }, [jawFilter, loading]);

  // Kemik Opaklığı / Görünürlüğü Değişimi
  useEffect(() => {
    if (!threeRef.current) return;
    threeRef.current.boneMeshes.forEach(mesh => {
      mesh.visible = showBone;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) mat.opacity = boneOpacity;
    });
  }, [showBone, boneOpacity]);

  // Pulpa Görünürlüğü Değişimi
  useEffect(() => {
    if (!threeRef.current) return;
    threeRef.current.pulpMeshes.forEach(mesh => {
      mesh.visible = showPulp;
    });
  }, [showPulp]);

  // Sinir Kanalı Görünürlüğü Değişimi
  useEffect(() => {
    if (!threeRef.current) return;
    threeRef.current.canalMeshes.forEach(mesh => {
      mesh.visible = showCanal;
    });
  }, [showCanal]);

  // ── Canlı Kesit (Clipping) Güncellemesi ────────────────────────────────────
  useEffect(() => {
    if (!threeRef.current) return;
    const { renderer, teethMeshes, boneMeshes } = threeRef.current;

    renderer.localClippingEnabled = clipEnabled;

    // Slider 0-100 aralığını -0.05 ile +0.05 metre aralığına haritala
    const mappedConstant = ((clipOffset - 50) / 50) * 0.045;
    clippingPlaneRef.current.constant = mappedConstant;

    teethMeshes.forEach(mesh => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.clippingPlanes = clipEnabled ? [clippingPlaneRef.current] : [];
        mat.clipShadows = true;
        mat.needsUpdate = true;
      }
    });

    boneMeshes.forEach(mesh => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.clippingPlanes = clipEnabled ? [clippingPlaneRef.current] : [];
        mat.needsUpdate = true;
      }
    });
  }, [clipEnabled, clipOffset]);

  // ── 3D Defect Markers Render Senkronizasyonu ──────────────────────────────
  useEffect(() => {
    if (!threeRef.current) return;
    const { scene, markerMeshes } = threeRef.current;

    // Eski işaretleyicileri temizle
    markerMeshes.forEach(m => scene.remove(m));
    markerMeshes.length = 0;

    defectMarkers.forEach(marker => {
      if (jawFilter !== 'all' && (jawFilter === 'upper' ? marker.fdi >= 30 : marker.fdi < 30)) return;
      const color = marker.type === 'curuk' ? '#ef4444' : marker.type === 'catlak' ? '#f59e0b' : '#a855f7';
      const geo = new THREE.SphereGeometry(0.0022, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...marker.position);
      scene.add(mesh);
      markerMeshes.push(mesh);
    });
  }, [defectMarkers, jawFilter, loading]);

  // ── Tema Değişiminde Sahne Arka Planı Güncellemesi ───────────────────────
  useEffect(() => {
    if (!threeRef.current) return;
    const { scene } = threeRef.current;
    scene.background = new THREE.Color(isLight ? '#f1f5f9' : '#0b1120');
  }, [isLight]);

  // ── Three.js Sahnesi & OMFAtlas Modeli Yükleme ─────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    let isDisposed = false;
    const container = containerRef.current;
    const canvas = canvasRef.current;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 480;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isLight ? '#f1f5f9' : '#0b1120');

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 20);
    camera.position.set(0, 0.01, 0.22);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.localClippingEnabled = false;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 0.04;
    controls.maxDistance = 0.6;
    controls.target.set(0, 0, 0);

    // 5. Lighting
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(0.4, 0.5, 0.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.1);
    fillLight.position.set(-0.4, 0.2, 0.4);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xffedd5, 0.8);
    backLight.position.set(0, -0.4, -0.4);
    scene.add(backLight);

    // 6. Groups & Maps
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const teethMeshes = new Map<number, THREE.Mesh>();
    const boneMeshes: THREE.Mesh[] = [];
    const pulpMeshes: THREE.Mesh[] = [];
    const canalMeshes: THREE.Mesh[] = [];
    const markerMeshes: THREE.Mesh[] = [];
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-100, -100);

    threeRef.current = {
      scene,
      camera,
      renderer,
      controls,
      teethMeshes,
      boneMeshes,
      pulpMeshes,
      canalMeshes,
      markerMeshes,
      rootGroup,
      raycaster,
      mouse,
      animFrameId: 0,
      hoveredMesh: null,
    };

    // 7. Render Loop
    const animate = () => {
      if (isDisposed) return;
      threeRef.current!.animFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 8. OMFAtlas Model Loader
    async function loadDentalModel() {
      try {
        setLoading(true);
        setLoadProgress(20);

        const [manifestRes, bufferRes] = await Promise.all([
          fetch('/models/dental/manifest.json'),
          fetch('/models/dental/toothfairy.bin'),
        ]);

        if (!manifestRes.ok || !bufferRes.ok) throw new Error('Dental 3D model dosyaları okunamadı.');

        setLoadProgress(50);
        const manifest = await manifestRes.json();
        const arrayBuffer = await bufferRes.arrayBuffer();
        setLoadProgress(80);

        if (isDisposed) return;

        const tfParts = manifest.parts.filter((p: any) => p.source === 'toothfairy');
        const teethParts = tfParts.filter((p: any) => p.group === 'tooth');

        const lo = [Infinity, Infinity, Infinity];
        const hi = [-Infinity, -Infinity, -Infinity];
        for (const part of teethParts) {
          for (let a = 0; a < 3; a++) {
            lo[a] = Math.min(lo[a], part.bounds[0][a]);
            hi[a] = Math.max(hi[a], part.bounds[1][a]);
          }
        }
        const center = lo.map((low, a) => (low + hi[a]) / 2);

        const createGeometry = (part: any) => {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arrayBuffer, part.positions, part.vertexCount * 3), 3));
          geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(arrayBuffer, part.normals, part.vertexCount * 3), 3));
          geo.setIndex(new THREE.BufferAttribute(new Uint32Array(arrayBuffer, part.indices, part.indexCount), 1));
          return geo;
        };

        tfParts.forEach((part: any) => {
          const geo = createGeometry(part);
          let mesh: THREE.Mesh;

          if (part.group === 'tooth' && part.fdi) {
            const axes = part.axes as ToothAxes | undefined;
            if (!axes) throw new Error(`Diş #${part.fdi} için anatomik eksen verisi bulunamadı.`);

            const positions = geo.getAttribute('position') as THREE.BufferAttribute;
            let minUpProjection = Infinity;
            let maxUpProjection = -Infinity;
            for (let i = 0; i < positions.count; i++) {
              const projection = projectOnToothAxis(
                [positions.getX(i), positions.getY(i), positions.getZ(i)],
                axes,
              );
              minUpProjection = Math.min(minUpProjection, projection);
              maxUpProjection = Math.max(maxUpProjection, projection);
            }

            // Vertex Colors tamponu oluştur ve mine beyazıyla başlat
            const colors = new Float32Array(part.vertexCount * 3);
            for (let i = 0; i < part.vertexCount; i++) {
              colors[i * 3] = 0.97;
              colors[i * 3 + 1] = 0.98;
              colors[i * 3 + 2] = 0.99;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            const mat = new THREE.MeshStandardMaterial({
              color: '#ffffff',
              vertexColors: true,
              roughness: 0.32,
              metalness: 0.05,
              side: THREE.DoubleSide,
            });
            mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { 
              fdi: part.fdi, 
              group: 'tooth', 
              name: TOOTH_NAMES[part.fdi] || `Diş ${part.fdi}`,
              axes,
              minUpProjection,
              maxUpProjection,
              vertexCount: part.vertexCount,
            };
            mesh.position.set(-center[0], -center[1], -center[2]);
            rootGroup.add(mesh);
            teethMeshes.set(part.fdi, mesh);
          } else if (part.group === 'bone') {
            const mat = new THREE.MeshStandardMaterial({
              color: '#d4bfa2',
              roughness: 0.75,
              metalness: 0.0,
              transparent: true,
              opacity: 0.4,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { group: 'bone', id: part.id };
            mesh.position.set(-center[0], -center[1], -center[2]);
            rootGroup.add(mesh);
            boneMeshes.push(mesh);
          } else if (part.id && part.id.startsWith('tf-pulp')) {
            const mat = new THREE.MeshStandardMaterial({
              color: '#e11d48',
              roughness: 0.4,
              metalness: 0.1,
              side: THREE.DoubleSide,
            });
            mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { group: 'pulp', id: part.id, fdi: part.fdi };
            mesh.position.set(-center[0], -center[1], -center[2]);
            mesh.visible = false;
            rootGroup.add(mesh);
            pulpMeshes.push(mesh);
          } else if (part.group === 'canal') {
            const mat = new THREE.MeshStandardMaterial({
              color: '#eab308',
              roughness: 0.5,
              metalness: 0.0,
              side: THREE.DoubleSide,
            });
            mesh = new THREE.Mesh(geo, mat);
            mesh.userData = { group: 'canal', id: part.id };
            mesh.position.set(-center[0], -center[1], -center[2]);
            mesh.visible = false;
            rootGroup.add(mesh);
            canalMeshes.push(mesh);
          }
        });

        rootGroup.scale.setScalar(0.001);
        rootGroup.rotation.x = -Math.PI / 2;

        setLoading(false);
        setLoadProgress(100);

        setTimeout(() => {
          if (!isDisposed) updateToothMaterials();
        }, 50);

      } catch (err: any) {
        console.error('3D Odontogram yükleme hatası:', err);
        if (!isDisposed) {
          setError(err?.message || 'Model yüklenemedi.');
          setLoading(false);
        }
      }
    }

    loadDentalModel();

    // 9. ResizeObserver
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0 || isDisposed) return;
      const { width: newW, height: newH } = entries[0].contentRect;
      if (newW > 0 && newH > 0) {
        camera.aspect = newW / newH;
        camera.updateProjectionMatrix();
        renderer.setSize(newW, newH);
      }
    });
    resizeObserver.observe(container);

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      if (threeRef.current) {
        cancelAnimationFrame(threeRef.current.animFrameId);
        threeRef.current.controls.dispose();
        threeRef.current.renderer.dispose();
      }
      scene.clear();
      threeRef.current = null;
    };
  }, []);

  // ── Raycasting (Hover & Pointer Etkileşimi) ────────────────────────────────
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !threeRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const { camera, teethMeshes, raycaster } = threeRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const meshes = Array.from(teethMeshes.values()).filter(mesh => mesh.visible);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitMesh = hit.object as THREE.Mesh;
      const fdi = hitMesh.userData?.fdi;

      if (fdi) {
        threeRef.current.hoveredMesh = hitMesh;
        canvasRef.current.style.cursor = activeTool === 'brush' ? 'crosshair' : 'pointer';

        // Face normal and anatomical axes are both in the model's local frame.
        // Keeping classification in that frame also makes it camera-independent.
        let surfaceName: string | null = null;
        const axes = hitMesh.userData.axes as ToothAxes | undefined;
        if (hit.face?.normal && axes) {
          surfaceName = detectSurfaceFromNormal(fdi, hit.face.normal, axes);
        }

        setHoveredTooth({
          fdi,
          name: TOOTH_NAMES[fdi] || `Diş ${fdi}`,
          detectedSurface: surfaceName,
          drafts: toothDrafts[String(fdi)] || [],
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        updateToothMaterials();
        return;
      }
    }

    if (threeRef.current.hoveredMesh) {
      threeRef.current.hoveredMesh = null;
      canvasRef.current.style.cursor = 'default';
      setHoveredTooth(null);
      updateToothMaterials();
    }
  };

  const handlePointerLeave = () => {
    if (!threeRef.current || !canvasRef.current) return;
    if (threeRef.current.hoveredMesh) {
      threeRef.current.hoveredMesh = null;
      canvasRef.current.style.cursor = 'default';
      setHoveredTooth(null);
      updateToothMaterials();
    }
  };

  // ── Tıklama (Diş & Yüzey / Fırça Seçimi) ──────────────────────────────────
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !threeRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const { camera, teethMeshes, raycaster } = threeRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const meshes = Array.from(teethMeshes.values()).filter(mesh => mesh.visible);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitMesh = hit.object as THREE.Mesh;
      const fdi = hitMesh.userData?.fdi;

      if (!fdi) return;

      // 1. Fırça / Çürük Çizim Modu
      if (activeTool === 'brush' && onAddDefectMarker && hit.face?.normal) {
        const nWorld = hit.face.normal.clone().transformDirection(hitMesh.matrixWorld);
        onAddDefectMarker({
          id: Math.random().toString(36).substring(7),
          fdi,
          position: [hit.point.x, hit.point.y, hit.point.z],
          normal: [nWorld.x, nWorld.y, nWorld.z],
          type: brushType,
        });
        return;
      }

      // 2. Normal Seçim Modu: Hızlı seçim ile 1:1 aynı davranır, tüm dişi seçer
      setIsHudVisible(true);
      onToothClick(fdi, e);
    }
  };

  // ── Sağ Tıklama (Context Menu) ────────────────────────────────────────────
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current || !threeRef.current || !onContextMenu) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const { camera, teethMeshes, raycaster } = threeRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const meshes = Array.from(teethMeshes.values()).filter(mesh => mesh.visible);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object as THREE.Mesh;
      const fdi = hitMesh.userData?.fdi;
      if (fdi) onContextMenu(fdi, e);
    }
  };

  // ── 3D Sahnede Sürükle-Bırak (Drag & Drop) Olayları ───────────────────────
  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!canvasRef.current || !threeRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const { camera, teethMeshes, raycaster } = threeRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const meshes = Array.from(teethMeshes.values()).filter(mesh => mesh.visible);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object as THREE.Mesh;
      const fdi = hitMesh.userData?.fdi;
      if (fdi && fdi !== dropTargetTooth) {
        setDropTargetTooth(fdi);
      }
    } else {
      if (dropTargetTooth !== null) setDropTargetTooth(null);
    }
  };

  const handleDragLeave = () => {
    if (dropTargetTooth !== null) setDropTargetTooth(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current || !threeRef.current || !onDropTreatment) {
      setDropTargetTooth(null);
      return;
    }

    const type = e.dataTransfer.getData("type");
    const val = e.dataTransfer.getData("value") || e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
    if (!val) {
      setDropTargetTooth(null);
      return;
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(val);
    } catch {
      parsed = {};
    }

    const dropPayload = { type, value: val, ...parsed };

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const { camera, teethMeshes, raycaster } = threeRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const meshes = Array.from(teethMeshes.values()).filter(mesh => mesh.visible);
    const intersects = raycaster.intersectObjects(meshes, false);

    let targetFdi: number | null = null;
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object as THREE.Mesh;
      targetFdi = hitMesh.userData?.fdi || null;
    }

    if (targetFdi) {
      onDropTreatment([targetFdi], dropPayload);
    }

    setDropTargetTooth(null);
  };

  // ── Hazır Kamera Pozisyonları (View Presets) ──────────────────────────────
  const setCameraView = (view: 'anterior' | 'upper_occlusal' | 'lower_occlusal' | 'right' | 'left' | 'reset') => {
    if (!threeRef.current) return;
    const { camera, controls } = threeRef.current;

    controls.target.set(0, 0, 0);

    switch (view) {
      case 'anterior':
      case 'reset':
        camera.position.set(0, 0.01, 0.22);
        camera.up.set(0, 1, 0);
        break;
      case 'upper_occlusal':
        camera.position.set(0, 0.22, 0.01);
        camera.up.set(0, 0, -1);
        break;
      case 'lower_occlusal':
        camera.position.set(0, -0.22, 0.01);
        camera.up.set(0, 0, 1);
        break;
      case 'right':
        camera.position.set(-0.22, 0.01, 0.03);
        camera.up.set(0, 1, 0);
        break;
      case 'left':
        camera.position.set(0.22, 0.01, 0.03);
        camera.up.set(0, 1, 0);
        break;
    }

    camera.lookAt(0, 0, 0);
    controls.update();
  };

  // ── Yüzey (MODBL) Toggle Yardımcısı ───────────────────────────────────────
  const toggleSurface = (fdi: number, s: string) => {
    if (!onUpdateSurfaces) return;
    const current = toothSurfaces[fdi] || [];
    const next = current.includes(s) ? current.filter(x => x !== s) : [...current, s];
    onUpdateSurfaces(fdi, next);
  };

  const applySurfacePreset = (fdi: number, preset: string[]) => {
    if (!onUpdateSurfaces) return;
    onUpdateSurfaces(fdi, preset);
  };

  // Seçili dişin yüzeyleri ve bölümü
  const activeSurfaces = activeTooth ? (toothSurfaces[activeTooth] || []) : [];
  const activeSection = activeTooth ? toothSections[activeTooth] : null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#0b1120',
        border: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      {/* 3D WebGL Canvas */}
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          outline: 'none',
        }}
      />

      {/* Sürükle-Bırak 3D Hedef Rozeti (Hedefteki Dişi Gösterir) */}
      {dropTargetTooth && (
        <div style={{
          position: 'absolute',
          top: 50,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#059669',
          color: '#ffffff',
          padding: '6px 16px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 700,
          zIndex: 15,
          boxShadow: '0 4px 16px rgba(5,150,105,0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'none',
          border: '1px solid #34d399',
        }}>
          <span>🎯 Diş #{dropTargetTooth} Hedeflendi</span>
          <span style={{ opacity: 0.9, fontWeight: 500 }}>(Atamak için Bırakın)</span>
        </div>
      )}

      {/* Yükleniyor Göstergesi */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: themeStyles.cardBg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 32 }}>🦷</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: themeStyles.textPrimary }}>
            3D Anatomik Diş & Çene Modeli Yükleniyor...
          </div>
          <div style={{ width: 180, height: 4, background: themeStyles.subCardBg, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${loadProgress}%`, height: '100%', background: '#3b82f6', transition: 'width 0.2s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: themeStyles.textSecondary }}>OMFAtlas CT Anatomik Veri Kümesi (%{loadProgress})</div>
        </div>
      )}

      {/* Hata Durumu */}
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: themeStyles.cardBg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>Model Yüklenemedi</div>
          <div style={{ fontSize: 11, color: themeStyles.textSecondary, maxWidth: 300 }}>{error}</div>
        </div>
      )}

      {/* ── ÜST KONTROL VE ARAÇ ÇUBUĞU ── */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          right: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        {/* Sol Grup: Kamera Açıları */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: themeStyles.cardBg,
            border: `1px solid ${themeStyles.border}`,
            borderRadius: 6,
            padding: 3,
            pointerEvents: 'auto',
            boxShadow: themeStyles.shadow,
          }}
        >
          <button
            type="button"
            onClick={() => setCameraView('anterior')}
            title="Ön Cephe (Tüm Ağız)"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 600,
              background: themeStyles.btnBg, color: themeStyles.textPrimary,
              border: `1px solid ${themeStyles.btnBorder}`, borderRadius: 4, cursor: 'pointer',
            }}
          >
            Ön
          </button>
          <button
            type="button"
            onClick={() => setCameraView('upper_occlusal')}
            title="Üst Çene Oklüzal Görünüm"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 600,
              background: themeStyles.btnBg, color: themeStyles.textPrimary,
              border: `1px solid ${themeStyles.btnBorder}`, borderRadius: 4, cursor: 'pointer',
            }}
          >
            Üst
          </button>
          <button
            type="button"
            onClick={() => setCameraView('lower_occlusal')}
            title="Alt Çene Oklüzal Görünüm"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 600,
              background: themeStyles.btnBg, color: themeStyles.textPrimary,
              border: `1px solid ${themeStyles.btnBorder}`, borderRadius: 4, cursor: 'pointer',
            }}
          >
            Alt
          </button>
          <button
            type="button"
            onClick={() => setCameraView('right')}
            title="Sağ Profil"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 600,
              background: themeStyles.btnBg, color: themeStyles.textPrimary,
              border: `1px solid ${themeStyles.btnBorder}`, borderRadius: 4, cursor: 'pointer',
            }}
          >
            Sağ
          </button>
          <button
            type="button"
            onClick={() => setCameraView('left')}
            title="Sol Profil"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 600,
              background: themeStyles.btnBg, color: themeStyles.textPrimary,
              border: `1px solid ${themeStyles.btnBorder}`, borderRadius: 4, cursor: 'pointer',
            }}
          >
            Sol
          </button>
          <button
            type="button"
            onClick={() => setCameraView('reset')}
            title="Görünümü Sıfırla"
            style={{
              padding: '4px 6px', background: themeStyles.btnBg, color: themeStyles.textSecondary,
              border: `1px solid ${themeStyles.btnBorder}`, borderRadius: 4, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <RotateCcw size={13} />
          </button>

          {/* Tüm Seçimleri Kaldır Butonu */}
          {selectedTeeth.length > 0 && onClearAllSelections && (
            <button
              type="button"
              onClick={onClearAllSelections}
              title="Tüm seçili dişleri ve yüzeyleri kaldır"
              style={{
                padding: '4px 8px', fontSize: 11, fontWeight: 600,
                background: '#ef4444', color: '#ffffff',
                border: 'none', borderRadius: 4, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                marginLeft: 4,
              }}
            >
              <X size={12} />
              Tümünü Temizle ({selectedTeeth.length})
            </button>
          )}
        </div>

        {/* Sağ Grup: Hekim Araçları (Fırça, Kesit, Kemik, Pulpa) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: themeStyles.cardBg,
            border: `1px solid ${themeStyles.border}`,
            borderRadius: 6,
            padding: 3,
            pointerEvents: 'auto',
            boxShadow: themeStyles.shadow,
          }}
        >
          {/* Çürük/Lezyon Çizim Fırçası */}
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'brush' ? 'select' : 'brush')}
            title="3D Lezyon / Çürük Çizim Fırçası"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 500,
              background: activeTool === 'brush' ? '#ef4444' : themeStyles.btnBg,
              color: activeTool === 'brush' ? '#ffffff' : themeStyles.textSecondary,
              border: `1px solid ${activeTool === 'brush' ? '#dc2626' : themeStyles.btnBorder}`,
              borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Paintbrush size={13} />
            Çizim
          </button>

          {/* Canlı Kesit Aç/Kapa */}
          <button
            type="button"
            onClick={() => {
              const nextState = !clipEnabled;
              setClipEnabled(nextState);
              if (nextState) setActiveTool('clip');
              else if (activeTool === 'clip') setActiveTool('select');
            }}
            title="Diş Kesiti ve Pulpa İnceleme Slider'ı"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 500,
              background: clipEnabled ? '#7c3aed' : themeStyles.btnBg,
              color: clipEnabled ? '#ffffff' : themeStyles.textSecondary,
              border: `1px solid ${clipEnabled ? '#6d28d9' : themeStyles.btnBorder}`,
              borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Scissors size={13} />
            Kesit
          </button>

          {/* Kemik Göster/Gizle */}
          <button
            type="button"
            onClick={() => setShowBone(!showBone)}
            title="Alveoler Çene Kemiğini Göster / Gizle"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 500,
              background: showBone ? '#2563eb' : themeStyles.btnBg,
              color: showBone ? '#ffffff' : themeStyles.textSecondary,
              border: `1px solid ${showBone ? '#1d4ed8' : themeStyles.btnBorder}`,
              borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Layers size={13} />
            Kemik
          </button>

          {/* Pulpa Göster/Gizle */}
          <button
            type="button"
            onClick={() => setShowPulp(!showPulp)}
            title="Kök Kanallarını & Pulpayı Göster / Gizle"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 500,
              background: showPulp ? '#e11d48' : themeStyles.btnBg,
              color: showPulp ? '#ffffff' : themeStyles.textSecondary,
              border: `1px solid ${showPulp ? '#be123c' : themeStyles.btnBorder}`,
              borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Sparkles size={13} />
            Pulpa
          </button>

          {/* Renk ve Bölüm Lejantı */}
          <button
            type="button"
            onClick={() => setShowLegend(!showLegend)}
            title="3D Renk ve Bölüm Anlamları"
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 500,
              background: showLegend ? '#2563eb' : themeStyles.btnBg,
              color: showLegend ? '#ffffff' : themeStyles.textSecondary,
              border: `1px solid ${showLegend ? '#1d4ed8' : themeStyles.btnBorder}`,
              borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Shield size={13} />
            Lejant
          </button>
        </div>
      </div>

      {/* ── 3D RENK VE BÖLÜM LEJANTI KARTI (Açıldığında) ── */}
      {showLegend && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            right: 10,
            background: themeStyles.cardBg,
            border: `1px solid ${themeStyles.border}`,
            borderRadius: 8,
            padding: '10px 14px',
            zIndex: 12,
            boxShadow: themeStyles.shadow,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            minWidth: 200,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${themeStyles.border}`, paddingBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: themeStyles.textPrimary }}>3D Renk & Bölüm Rehberi</span>
            <button
              type="button"
              onClick={() => setShowLegend(false)}
              style={{ background: 'none', border: 'none', color: themeStyles.textSecondary, cursor: 'pointer', padding: 0 }}
            >
              <X size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: themeStyles.textPrimary }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#2563eb', display: 'inline-block' }} />
            <span>🎯 Seçili Diş (Mavi)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: themeStyles.textPrimary }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#06b6d4', display: 'inline-block' }} />
            <span>🔲 Seçili Yüzey / MODBL (Turkuaz)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: themeStyles.textPrimary }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#f59e0b', display: 'inline-block' }} />
            <span>👑 Kuron (Altın Sarısı)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: themeStyles.textPrimary }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#f97316', display: 'inline-block' }} />
            <span>🛡️ Kole / Diş Boynu (Turuncu)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: themeStyles.textPrimary }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#10b981', display: 'inline-block' }} />
            <span>🌱 Kök / Kök Kanalları (Yeşil)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: themeStyles.textPrimary }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#8b5cf6', display: 'inline-block' }} />
            <span>🔷 Ayrı Kök (Mezyal/Distal - Mor)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: themeStyles.textPrimary }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#ef4444', display: 'inline-block' }} />
            <span>🔴 Çürük / Lezyon İşareti</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: themeStyles.textPrimary }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#f1f5f9', border: '1px solid #cbd5e1', display: 'inline-block' }} />
            <span>⚪ Doğal Mine (Seçilmemiş)</span>
          </div>
        </div>
      )}

      {/* ── CANLI KESİT SLIDER ÇUBUĞU (Açıkken Belirir) ── */}
      {clipEnabled && (
        <div
          style={{
            position: 'absolute',
            top: 50,
            left: 10,
            right: 10,
            maxWidth: 380,
            background: themeStyles.cardBg,
            border: '1px solid #8b5cf6',
            borderRadius: 6,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            zIndex: 6,
            boxShadow: themeStyles.shadow,
          }}
        >
          <Scissors size={14} color="#8b5cf6" />
          <span style={{ fontSize: 11, fontWeight: 600, color: themeStyles.textPrimary, whiteSpace: 'nowrap' }}>
            Kesit Seviyesi:
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={clipOffset}
            onChange={e => setClipOffset(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#8b5cf6', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 10, color: isLight ? '#6d28d9' : '#c4b5fd', minWidth: 32, textAlign: 'right', fontWeight: 600 }}>
            %{clipOffset}
          </span>
          <button
            type="button"
            onClick={() => setClipEnabled(false)}
            style={{ background: 'none', border: 'none', color: themeStyles.textSecondary, cursor: 'pointer', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── ÇİZİM / FIRÇA TÜRÜ SEÇİCİSİ (Çizim Modundayken) ── */}
      {activeTool === 'brush' && (
        <div
          style={{
            position: 'absolute',
            top: 50,
            right: 10,
            background: themeStyles.cardBg,
            border: '1px solid #ef4444',
            borderRadius: 6,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            zIndex: 6,
            boxShadow: themeStyles.shadow,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: isLight ? '#b91c1c' : '#fca5a5' }}>İşaretçi:</span>
          {(['curuk', 'catlak', 'lezyon'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setBrushType(t)}
              style={{
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                background: brushType === t ? (t === 'curuk' ? '#ef4444' : t === 'catlak' ? '#f59e0b' : '#a855f7') : themeStyles.btnBg,
                color: brushType === t ? '#ffffff' : themeStyles.textSecondary,
              }}
            >
              {t === 'curuk' ? '🔴 Çürük' : t === 'catlak' ? '🟠 Çatlak' : '🟣 Lezyon'}
            </button>
          ))}
          {defectMarkers.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (defectMarkers[0] && onRemoveDefectMarker) onRemoveDefectMarker(defectMarkers[defectMarkers.length - 1].id);
              }}
              title="Son İşareti Geri Al"
              style={{ padding: '3px 6px', fontSize: 10, background: themeStyles.subCardBg, color: themeStyles.textPrimary, border: `1px solid ${themeStyles.border}`, borderRadius: 4, cursor: 'pointer' }}
            >
              Geri Al ({defectMarkers.length})
            </button>
          )}
        </div>
      )}

      {/* ── 3D DENTAL HUD (SEÇİLİ DİŞ İÇİN YÜZEY VE BÖLÜM SEÇİCİ) ── */}
      {activeTooth && isHudVisible && (
        <div
          style={{
            position: 'absolute',
            bottom: 38,
            right: 12,
            width: 250,
            background: themeStyles.compassBg,
            border: `1px solid ${themeStyles.compassBorder}`,
            borderRadius: 8,
            padding: 12,
            zIndex: 6,
            boxShadow: themeStyles.shadow,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Başlık ve Kapatma Butonu */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${themeStyles.border}`, paddingBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#ffffff', background: '#2563eb', padding: '1px 6px', borderRadius: 4 }}>
                Diş #{activeTooth}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: themeStyles.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                {TOOTH_NAMES[activeTooth] || ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: isLight ? '#1d4ed8' : '#38bdf8', fontWeight: 700 }}>
                {activeSurfaces.length > 0 ? activeSurfaces.join('') : (activeSection ? (activeSection === 'crown' ? 'Kuron' : activeSection === 'cervical' ? 'Kole' : 'Kök') : 'Tüm')}
              </span>
              {/* Paneli Kapat (✕) Butonu */}
              <button
                type="button"
                onClick={() => setIsHudVisible(false)}
                title="Paneli Kapat"
                style={{
                  background: themeStyles.subCardBg,
                  border: `1px solid ${themeStyles.border}`,
                  color: themeStyles.textSecondary,
                  cursor: 'pointer',
                  padding: '2px 5px',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* 1. MODBL Hızlı Yüzey Pusulası (Cross/Pad) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: themeStyles.textSecondary, width: '100%', display: 'flex', justifyContent: 'space-between' }}>
              <span>Yüzeyler (MODBL):</span>
              <span style={{ color: isLight ? '#1d4ed8' : '#38bdf8', fontWeight: 700 }}>{activeSurfaces.join('-') || 'Seçilmedi'}</span>
            </div>

            {/* Pusula Izgarası */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gridTemplateRows: 'repeat(3, 34px)', gap: 3, justifyContent: 'center' }}>
              {/* Boş */}
              <div />
              {/* Bukkal (Üst) */}
              <button
                type="button"
                onClick={() => toggleSurface(activeTooth, 'B')}
                title="Bukkal (Yanak Yüzeyi)"
                style={{
                  background: activeSurfaces.includes('B') ? '#06b6d4' : themeStyles.compassPadBg,
                  color: activeSurfaces.includes('B') ? '#ffffff' : themeStyles.compassPadText,
                  border: `1px solid ${activeSurfaces.includes('B') ? '#0891b2' : themeStyles.compassPadBorder}`,
                  borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                B
              </button>
              {/* Boş */}
              <div />

              {/* Mezyal (Sol) */}
              <button
                type="button"
                onClick={() => toggleSurface(activeTooth, 'M')}
                title="Mezyal (Ön Arayüz)"
                style={{
                  background: activeSurfaces.includes('M') ? '#06b6d4' : themeStyles.compassPadBg,
                  color: activeSurfaces.includes('M') ? '#ffffff' : themeStyles.compassPadText,
                  border: `1px solid ${activeSurfaces.includes('M') ? '#0891b2' : themeStyles.compassPadBorder}`,
                  borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                M
              </button>
              {/* Oklüzal (Merkez) */}
              <button
                type="button"
                onClick={() => toggleSurface(activeTooth, 'O')}
                title="Oklüzal (Çiğneme/Isırma Yüzeyi)"
                style={{
                  background: activeSurfaces.includes('O') ? '#06b6d4' : themeStyles.compassPadBg,
                  color: activeSurfaces.includes('O') ? '#ffffff' : themeStyles.compassPadText,
                  border: `1px solid ${activeSurfaces.includes('O') ? '#0891b2' : themeStyles.compassPadBorder}`,
                  borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                O
              </button>
              {/* Distal (Sağ) */}
              <button
                type="button"
                onClick={() => toggleSurface(activeTooth, 'D')}
                title="Distal (Arka Arayüz)"
                style={{
                  background: activeSurfaces.includes('D') ? '#06b6d4' : themeStyles.compassPadBg,
                  color: activeSurfaces.includes('D') ? '#ffffff' : themeStyles.compassPadText,
                  border: `1px solid ${activeSurfaces.includes('D') ? '#0891b2' : themeStyles.compassPadBorder}`,
                  borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                D
              </button>

              {/* Boş */}
              <div />
              {/* Lingual (Alt) */}
              <button
                type="button"
                onClick={() => toggleSurface(activeTooth, 'L')}
                title="Lingual / Palatinal (Dil/Damak Yüzeyi)"
                style={{
                  background: activeSurfaces.includes('L') ? '#06b6d4' : themeStyles.compassPadBg,
                  color: activeSurfaces.includes('L') ? '#ffffff' : themeStyles.compassPadText,
                  border: `1px solid ${activeSurfaces.includes('L') ? '#0891b2' : themeStyles.compassPadBorder}`,
                  borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                L
              </button>
              {/* Boş */}
              <div />
            </div>

            {/* Hızlı Yüzey Hazır Butonları (1 Tıkla) */}
            <div style={{ display: 'flex', gap: 3, marginTop: 4, width: '100%' }}>
              <button
                type="button"
                onClick={() => applySurfacePreset(activeTooth, ['O'])}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 600,
                  background: activeSurfaces.length === 1 && activeSurfaces.includes('O') ? '#06b6d4' : themeStyles.compassPresetBg,
                  color: activeSurfaces.length === 1 && activeSurfaces.includes('O') ? '#ffffff' : themeStyles.compassPresetText,
                  border: `1px solid ${activeSurfaces.length === 1 && activeSurfaces.includes('O') ? '#0891b2' : themeStyles.compassPresetBorder}`,
                  borderRadius: 4, cursor: 'pointer'
                }}
              >
                O
              </button>
              <button
                type="button"
                onClick={() => applySurfacePreset(activeTooth, ['M', 'O'])}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 600,
                  background: activeSurfaces.length === 2 && activeSurfaces.includes('M') && activeSurfaces.includes('O') ? '#06b6d4' : themeStyles.compassPresetBg,
                  color: activeSurfaces.length === 2 && activeSurfaces.includes('M') && activeSurfaces.includes('O') ? '#ffffff' : themeStyles.compassPresetText,
                  border: `1px solid ${activeSurfaces.length === 2 && activeSurfaces.includes('M') && activeSurfaces.includes('O') ? '#0891b2' : themeStyles.compassPresetBorder}`,
                  borderRadius: 4, cursor: 'pointer'
                }}
              >
                MO
              </button>
              <button
                type="button"
                onClick={() => applySurfacePreset(activeTooth, ['D', 'O'])}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 600,
                  background: activeSurfaces.length === 2 && activeSurfaces.includes('D') && activeSurfaces.includes('O') ? '#06b6d4' : themeStyles.compassPresetBg,
                  color: activeSurfaces.length === 2 && activeSurfaces.includes('D') && activeSurfaces.includes('O') ? '#ffffff' : themeStyles.compassPresetText,
                  border: `1px solid ${activeSurfaces.length === 2 && activeSurfaces.includes('D') && activeSurfaces.includes('O') ? '#0891b2' : themeStyles.compassPresetBorder}`,
                  borderRadius: 4, cursor: 'pointer'
                }}
              >
                DO
              </button>
              <button
                type="button"
                onClick={() => applySurfacePreset(activeTooth, ['M', 'O', 'D'])}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 600,
                  background: activeSurfaces.length === 3 && activeSurfaces.includes('M') && activeSurfaces.includes('O') && activeSurfaces.includes('D') ? '#06b6d4' : themeStyles.compassPresetBg,
                  color: activeSurfaces.length === 3 && activeSurfaces.includes('M') && activeSurfaces.includes('O') && activeSurfaces.includes('D') ? '#ffffff' : themeStyles.compassPresetText,
                  border: `1px solid ${activeSurfaces.length === 3 && activeSurfaces.includes('M') && activeSurfaces.includes('O') && activeSurfaces.includes('D') ? '#0891b2' : themeStyles.compassPresetBorder}`,
                  borderRadius: 4, cursor: 'pointer'
                }}
              >
                MOD
              </button>
              <button
                type="button"
                onClick={() => applySurfacePreset(activeTooth, [])}
                title="Yüzeyleri Sıfırla"
                style={{ padding: '4px 6px', fontSize: 10, fontWeight: 700, background: themeStyles.compassPresetBg, color: '#ef4444', border: `1px solid ${themeStyles.border}`, borderRadius: 4, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* 2. Anatomik Bölüm & Kök Seçici */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${themeStyles.border}`, paddingTop: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: themeStyles.textSecondary }}>Anatomik Bölüm:</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onUpdateSection && onUpdateSection(activeTooth, activeSection === 'crown' ? null : 'crown')}
                style={{
                  flex: 1, minWidth: 60, padding: '4px 6px', fontSize: 10, fontWeight: 600,
                  background: activeSection === 'crown' ? '#f59e0b' : themeStyles.compassPadBg,
                  color: activeSection === 'crown' ? '#ffffff' : themeStyles.compassPadText,
                  border: `1px solid ${activeSection === 'crown' ? '#d97706' : themeStyles.compassPadBorder}`,
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                👑 Kuron
              </button>
              <button
                type="button"
                onClick={() => onUpdateSection && onUpdateSection(activeTooth, activeSection === 'cervical' ? null : 'cervical')}
                style={{
                  flex: 1, minWidth: 60, padding: '4px 6px', fontSize: 10, fontWeight: 600,
                  background: activeSection === 'cervical' ? '#f97316' : themeStyles.compassPadBg,
                  color: activeSection === 'cervical' ? '#ffffff' : themeStyles.compassPadText,
                  border: `1px solid ${activeSection === 'cervical' ? '#ea580c' : themeStyles.compassPadBorder}`,
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                🛡️ Kole
              </button>
              <button
                type="button"
                onClick={() => onUpdateSection && onUpdateSection(activeTooth, activeSection === 'root' ? null : 'root')}
                style={{
                  flex: 1, minWidth: 60, padding: '4px 6px', fontSize: 10, fontWeight: 600,
                  background: activeSection === 'root' ? '#10b981' : themeStyles.compassPadBg,
                  color: activeSection === 'root' ? '#ffffff' : themeStyles.compassPadText,
                  border: `1px solid ${activeSection === 'root' ? '#059669' : themeStyles.compassPadBorder}`,
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                🌱 Kök
              </button>
            </div>

            {/* Çok köklü azılar için spesifik kök ayrımı */}
            {isMultiRooted(activeTooth) && (
              <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                {getToothRoots(activeTooth).map(rootName => (
                  <button
                    key={rootName}
                    type="button"
                    onClick={() => onUpdateSection && onUpdateSection(activeTooth, activeSection === rootName ? null : rootName)}
                    style={{
                      flex: 1, padding: '3px 4px', fontSize: 9, fontWeight: 600,
                      background: activeSection === rootName ? '#8b5cf6' : themeStyles.compassPadBg,
                      color: activeSection === rootName ? '#ffffff' : themeStyles.compassPadText,
                      border: `1px solid ${activeSection === rootName ? '#7c3aed' : themeStyles.compassPadBorder}`,
                      borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                    title={rootName}
                  >
                    {rootName.replace(' Kök', '')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. Seçim Resetleme & Bu Dişi Bırakma Butonları */}
          <div style={{ display: 'flex', gap: 6, borderTop: `1px solid ${themeStyles.border}`, paddingTop: 6 }}>
            <button
              type="button"
              onClick={() => {
                if (onUpdateSurfaces) onUpdateSurfaces(activeTooth, []);
                if (onUpdateSection) onUpdateSection(activeTooth, null);
              }}
              title="Bu dişin seçili yüzeylerini ve anatomik bölümünü sıfırla"
              style={{
                flex: 1,
                padding: '5px 6px',
                fontSize: 10,
                fontWeight: 600,
                background: themeStyles.subCardBg,
                color: themeStyles.textPrimary,
                border: `1px solid ${themeStyles.border}`,
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <RotateCcw size={11} />
              Seçimi Sıfırla
            </button>
            <button
              type="button"
              onClick={(e) => {
                onToothClick(activeTooth, e);
              }}
              title="Bu dişin seçimini tamamen kaldır"
              style={{
                flex: 1,
                padding: '5px 6px',
                fontSize: 10,
                fontWeight: 600,
                background: '#ef444415',
                color: '#ef4444',
                border: '1px solid #ef444440',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <X size={11} />
              Dişi Kaldır
            </button>
          </div>
        </div>
      )}

      {/* HUD Kapalıyken Diş Seçiliyse Paneli Tekrar Açma Butonu */}
      {activeTooth && !isHudVisible && (
        <button
          type="button"
          onClick={() => setIsHudVisible(true)}
          style={{
            position: 'absolute',
            bottom: 38,
            right: 12,
            background: themeStyles.cardBg,
            border: `1px solid ${themeStyles.compassBorder}`,
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: themeStyles.textPrimary,
            boxShadow: themeStyles.shadow,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            zIndex: 6,
          }}
        >
          <span>🦷</span>
          <span>Diş #{activeTooth} Panelini Aç</span>
          <span style={{ fontSize: 10, color: isLight ? '#1d4ed8' : '#38bdf8', fontWeight: 700 }}>
            ({activeSurfaces.length > 0 ? activeSurfaces.join('') : (activeSection ? (activeSection === 'crown' ? 'Kuron' : activeSection === 'cervical' ? 'Kole' : 'Kök') : 'Tüm')})
          </span>
        </button>
      )}

      {/* Hover Tooltip (İmleç Üzerindeki Diş Bilgisi) */}
      {hoveredTooth && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(hoveredTooth.x + 16, (containerRef.current?.clientWidth || 400) - 200),
            top: Math.max(hoveredTooth.y - 48, 12),
            background: themeStyles.tooltipBg,
            border: `1px solid ${themeStyles.tooltipBorder}`,
            borderRadius: 6,
            padding: '6px 10px',
            pointerEvents: 'none',
            zIndex: 20,
            boxShadow: themeStyles.shadow,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', background: '#2563eb', padding: '1px 5px', borderRadius: 4 }}>
              Diş #{hoveredTooth.fdi}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: themeStyles.tooltipText }}>
              {hoveredTooth.name}
            </span>
          </div>
          {hoveredTooth.detectedSurface && (
            <div style={{ marginTop: 2, fontSize: 10, color: isLight ? '#1d4ed8' : '#38bdf8', fontWeight: 600 }}>
              Yüzey: {hoveredTooth.detectedSurface === 'O' ? 'Oklüzal (Isırma)' : hoveredTooth.detectedSurface === 'M' ? 'Mezyal (Ön Arayüz)' : hoveredTooth.detectedSurface === 'D' ? 'Distal (Arka Arayüz)' : hoveredTooth.detectedSurface === 'B' ? 'Bukkal (Yanak)' : 'Lingual (Dil)'}
            </div>
          )}
          {hoveredTooth.drafts && hoveredTooth.drafts.length > 0 && (
            <div style={{ marginTop: 2, fontSize: 10, color: isLight ? '#1d4ed8' : '#38bdf8' }}>
              Planlanan: {hoveredTooth.drafts.map(d => d.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* ── ALT BİLGİ & YARDIM ÇUBUĞU ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 10,
          right: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 10,
          color: themeStyles.bottomBarText,
          pointerEvents: 'none',
          background: themeStyles.bottomBarBg,
          padding: '5px 10px',
          borderRadius: 6,
          border: `1px solid ${themeStyles.bottomBarBorder}`,
          boxShadow: themeStyles.shadow,
        }}
      >
        <div style={{ display: 'flex', gap: 12, fontWeight: 500 }}>
          <span>🖱️ Tıkla: Diş & Yüzey Seç</span>
          <span>⚡ Sağ Panel: MODBL Pusulası</span>
          <span>🔍 İki Parmak: Yakınlaştır</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Tüm Seçimleri Kaldır Butonu */}
          {selectedTeeth.length > 0 && onClearAllSelections && (
            <button
              type="button"
              onClick={onClearAllSelections}
              title="Tüm seçili dişleri ve yüzeyleri kaldır"
              style={{
                pointerEvents: 'auto',
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <X size={11} /> Tüm Seçimleri Kaldır ({selectedTeeth.length})
            </button>
          )}
          <span>Seçili: <strong style={{ color: themeStyles.bottomBarStrong }}>{selectedTeeth.length} Diş</strong></span>
          {activeTooth && toothSurfaces[activeTooth]?.length > 0 && (
            <span>(Yüzey: <strong style={{ color: isLight ? '#2563eb' : '#60a5fa' }}>{toothSurfaces[activeTooth].join('')}</strong>)</span>
          )}
        </div>
      </div>
    </div>
  );
}
