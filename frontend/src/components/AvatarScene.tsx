"use client";

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

type Props = {
  analyser?: AnalyserNode | null;
  isSpeaking?: boolean;
  className?: string;
};

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

const MODEL = "/avatar/model.glb";
const HEIGHT = 2.65;
const CAMERA_FOV = 31;

// The uploaded GLB has these exact Mixamo-style bone names.
// Use world-space directions, not guessed local rotation.z values:
// these shoulder joints already contain substantial rest rotations.
function pointBoneToward(
  scene: THREE.Group,
  boneName: string,
  childName: string,
  desiredWorldDirection: THREE.Vector3,
) {
  const bone = scene.getObjectByName(boneName) as THREE.Bone | undefined;
  const child = scene.getObjectByName(childName) as THREE.Bone | undefined;
  if (!bone?.isBone || !child?.isBone || !bone.parent) return false;

  scene.updateMatrixWorld(true);
  const from = bone.getWorldPosition(new THREE.Vector3());
  const to = child.getWorldPosition(new THREE.Vector3());
  const current = to.sub(from).normalize();
  if (current.lengthSq() < 0.5) return false;

  const deltaWorld = new THREE.Quaternion().setFromUnitVectors(
    current,
    desiredWorldDirection.clone().normalize(),
  );
  const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const desiredWorld = deltaWorld.multiply(boneWorld);
  bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld)).normalize();
  scene.updateMatrixWorld(true);
  return true;
}

function Mother({ analyser, isSpeaking = false }: Pick<Props, "analyser" | "isSpeaking">) {
  const { scene: original } = useGLTF(MODEL);
  const scene = useMemo(() => cloneSkeleton(original), [original]);
  const rig = useRef<THREE.Group>(null);
  const mouth = useRef(0);
  const idleTime = useRef(0);
  const spectrum = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const { camera, invalidate } = useThree();

  const targets = useMemo(() => {
    const meshes: MorphMesh[] = [];
    scene.traverse((node) => {
      const mesh = node as MorphMesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        meshes.push(mesh);
      }
    });
    return meshes;
  }, [scene]);

  useEffect(() => {
    // 1) Restore unscaled model before applying the pose (the scene is a private clone).
    scene.position.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.updateMatrixWorld(true);

    // 2) Bring each upper arm down in WORLD space, slightly outward and forward.
    // The GLB uses +Z toward the viewer (verified from eye-bone positions).
    pointBoneToward(scene, "LeftArm", "LeftForeArm", new THREE.Vector3(0.15, -0.97, 0.18));
    pointBoneToward(scene, "RightArm", "RightForeArm", new THREE.Vector3(-0.15, -0.97, 0.18));
    // A gentle elbow bend, with hands remaining close to the body.
    pointBoneToward(scene, "LeftForeArm", "LeftHand", new THREE.Vector3(0.08, -0.96, 0.27));
    pointBoneToward(scene, "RightForeArm", "RightHand", new THREE.Vector3(-0.08, -0.96, 0.27));

    // 3) Normalize AFTER posing. This avoids the old camera/head clipping bug.
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    if (size.y < 0.0001) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = HEIGHT / size.y;
    scene.scale.setScalar(scale);
    scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    scene.updateMatrixWorld(true);

    // 4) Portrait framing: upper torso, shoulders and complete head.
    const head = scene.getObjectByName("Head");
    const headY = head?.getWorldPosition(new THREE.Vector3()).y ?? HEIGHT * 0.89;
    const targetY = headY - 0.38;
    const target = new THREE.Vector3(0, targetY, 0);
    camera.position.set(0, targetY + 0.035, 3.45);
    camera.lookAt(target);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = CAMERA_FOV;
      camera.near = 0.05;
      camera.far = 100;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [scene, camera, invalidate]);

  useFrame((_, delta) => {
    idleTime.current += delta;
    if (rig.current) {
      // Only a very subtle horizontal idle movement, NEVER vertical bobbing.
      rig.current.rotation.y = Math.sin(idleTime.current * 0.32) * 0.006;
    }

    let volume = 0;
    if (isSpeaking && analyser) {
      if (!spectrum.current || spectrum.current.length !== analyser.frequencyBinCount) {
        spectrum.current = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(spectrum.current);
      let total = 0;
      const count = Math.min(spectrum.current.length, 96);
      for (let i = 2; i < count; i++) total += spectrum.current[i];
      volume = THREE.MathUtils.clamp(total / Math.max(count - 2, 1) / 68, 0, 1);
      if (volume < 0.09) volume = 0;
    }
    mouth.current = THREE.MathUtils.damp(mouth.current, volume, 15, delta);

    const phase = idleTime.current % 4.2;
    const blink = phase > 3.55 && phase < 3.71
      ? Math.sin(((phase - 3.55) / 0.16) * Math.PI) : 0;

    for (const mesh of targets) {
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      const apply = (names: string[], value: number) => {
        for (const name of names) {
          const key = Object.keys(dict).find((k) => k.toLowerCase() === name.toLowerCase());
          if (key !== undefined) influences[dict[key]] = value;
        }
      };
      apply(["jawOpen", "mouthOpen", "viseme_aa"], mouth.current * 0.82);
      apply(["mouthFunnel"], mouth.current * 0.15);
      apply(["mouthPucker"], mouth.current * 0.08);
      apply(["eyeBlinkLeft", "eyeBlinkRight", "eyesClosed"], blink);
    }
  });

  // Never generate/play audio here; session/page.tsx owns the only audio player.
  return <group ref={rig}><primitive object={scene} /></group>;
}

export default function AvatarScene({ analyser = null, isSpeaking = false, className = "" }: Props) {
  return (
    <div className={`relative isolate h-full w-full overflow-hidden bg-[#d1dfd5] ${className}`}>
      {/* Bundled clinic artwork: no external URL or extra dependencies. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/clinic/consultation-room.svg')" }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,rgba(255,255,245,.19),transparent_44%)]" />
      <Canvas className="!absolute !inset-0" gl={{ alpha: true, antialias: true }} camera={{ position: [0, 2.1, 3.45], fov: CAMERA_FOV }} onCreated={({ gl, scene: root }) => { gl.setClearColor("#ffffff", 0); root.background = null; }}>
        <ambientLight intensity={0.9} />
        <hemisphereLight args={["#ffffff", "#849c93", 0.9]} />
        <directionalLight position={[-3, 5, 5]} intensity={1.1} />
        <directionalLight position={[3, 3, -2]} intensity={0.45} />
        <Mother analyser={analyser} isSpeaking={isSpeaking} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(8,39,42,.20),transparent_27%,transparent_73%,rgba(8,39,42,.13))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[31%] bg-gradient-to-t from-[#071d24]/45 to-transparent" />
    </div>
  );
}

useGLTF.preload(MODEL);
