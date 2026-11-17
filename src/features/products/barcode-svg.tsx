import Svg, { Rect } from 'react-native-svg';

import { barRuns, type EncodedBarcode } from './barcode';

const QUIET_ZONE = 10;

/** On-screen preview of a label's bars (the printed HTML uses the same runs). Always black on white for scanners. */
export function BarcodeSvg({ encoded, height = 60 }: { encoded: EncodedBarcode; height?: number }) {
  const width = encoded.bits.length + QUIET_ZONE * 2;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" accessibilityLabel={`Barcode ${encoded.text}`}>
      <Rect x={0} y={0} width={width} height={height} fill="#FFFFFF" />
      {barRuns(encoded.bits).map(([x, w]) => (
        <Rect key={x} x={x + QUIET_ZONE} y={0} width={w} height={height} fill="#000000" />
      ))}
    </Svg>
  );
}
