import React from 'react';
import aqariLogo from '../assets/aqari-logo.png';

interface PlatformLogoProps {
  width?: number;
  alt?: string;
}

const PlatformLogo: React.FC<PlatformLogoProps> = ({ width = 180, alt = 'شعار عقاري' }) => {
  return (
    <img
      src={aqariLogo}
      alt={alt}
      style={{
        width,
        maxWidth: '100%',
        height: 'auto',
        display: 'block',
        objectFit: 'contain',
      }}
    />
  );
};

export default PlatformLogo;

