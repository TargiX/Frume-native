import { Image as SkiaImage, SkImage } from '@shopify/react-native-skia';

type DrawBoardImageProps = {
  skiaImage: SkImage;
  boardWidth: number;
  boardHeight: number;
  offsetX?: number;
  offsetY?: number;
};

export function DrawBoardImage({
  skiaImage,
  boardWidth,
  boardHeight,
  offsetX = 0,
  offsetY = 0,
}: DrawBoardImageProps) {
  return (
    <SkiaImage
      image={skiaImage}
      x={-offsetX}
      y={-offsetY}
      width={boardWidth}
      height={boardHeight}
      fit="cover"
    />
  );
}
