"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float time;
  uniform sampler2D map;
  uniform vec2 resolution;
  uniform vec2 mouse;
  
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    
    // Parallax mouse effect
    vec2 offset = mouse * 0.05;
    uv += offset * (1.0 - uv.y);
    
    vec4 texColor = texture2D(map, uv);
    
    // Convert to grayscale for thresholding
    float luma = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
    
    // Dynamic contrast driven by time
    luma = smoothstep(0.1, 0.9, luma + sin(time * 0.5) * 0.05);

    // Dithering setup
    vec2 ditherUv = gl_FragCoord.xy / 4.0;
    int x = int(mod(ditherUv.x, 4.0));
    int y = int(mod(ditherUv.y, 4.0));
    
    // Pull index manually
    float ditherValue = 0.0;
    
    if(x==0 && y==0) ditherValue = 0.0;
    else if(x==1 && y==0) ditherValue = 8.0;
    else if(x==2 && y==0) ditherValue = 2.0;
    else if(x==3 && y==0) ditherValue = 10.0;
    else if(x==0 && y==1) ditherValue = 12.0;
    else if(x==1 && y==1) ditherValue = 4.0;
    else if(x==2 && y==1) ditherValue = 14.0;
    else if(x==3 && y==1) ditherValue = 6.0;
    else if(x==0 && y==2) ditherValue = 3.0;
    else if(x==1 && y==2) ditherValue = 11.0;
    else if(x==2 && y==2) ditherValue = 1.0;
    else if(x==3 && y==2) ditherValue = 9.0;
    else if(x==0 && y==3) ditherValue = 15.0;
    else if(x==1 && y==3) ditherValue = 7.0;
    else if(x==2 && y==3) ditherValue = 13.0;
    else if(x==3 && y==3) ditherValue = 5.0;
    
    ditherValue /= 16.0;

    // Apply dither threshold
    float finalLight = step(ditherValue, luma);
    
    // Colors: Amber glow and deep black
    vec3 darkColor = vec3(0.04, 0.04, 0.04);
    vec3 lightColor = vec3(1.0, 0.7, 0.2); // Bright Amber
    
    // Mouse hover reveals original map slightly
    float distToMouse = distance(vUv, vec2(0.5) + mouse);
    float hoverReveal = smoothstep(0.3, 0.0, distToMouse) * 0.4;

    vec3 mixedColor = mix(darkColor, lightColor, finalLight);
    vec3 outColor = mix(mixedColor, texColor.rgb, hoverReveal);
    
    // Alpha mask based on original luma to make the background transparent
    float alpha = smoothstep(0.05, 0.2, luma) * texColor.a;

    gl_FragColor = vec4(outColor, alpha);
  }
`;

function DitherPlane() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const texture = useTexture("/assets/gladiator.png");

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      map: { value: texture },
      resolution: { value: new THREE.Vector2() },
      mouse: { value: new THREE.Vector2(0, 0) },
    }),
    [texture],
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
      // Convert pointer (-1 to 1) to a normalized mouse vector for the shader
      const targetMouseX = state.pointer.x * 0.5;
      const targetMouseY = state.pointer.y * 0.5;

      materialRef.current.uniforms.mouse.value.x +=
        (targetMouseX - materialRef.current.uniforms.mouse.value.x) * 0.1;
      materialRef.current.uniforms.mouse.value.y +=
        (targetMouseY - materialRef.current.uniforms.mouse.value.y) * 0.1;
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[6, 6]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
      />
    </mesh>
  );
}

export function HeroDitherGraphic() {
  return (
    <div className="fixed inset-0 z-0 opacity-80 mix-blend-screen pointer-events-auto">
      <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
        <DitherPlane />
      </Canvas>
    </div>
  );
}
