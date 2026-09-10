import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { getCutter } from '../../../puzzle/cutters';
import type { PuzzleCutterId, PuzzleDifficulty } from '../../../puzzle/types';

/** Seams use the selected image aspect and size, matching the playable cut. */
export function PhotoCutPreview({
  uri,
  imageWidth,
  imageHeight,
  cutterId,
  difficulty,
}: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  cutterId: PuzzleCutterId;
  difficulty: PuzzleDifficulty;
}) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [preview, setPreview] = useState<{
    paths: string[];
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    let current = true;
    setPreview(null);
    if (!frame.width || !frame.height) return;
    void Promise.resolve()
      .then(() =>
        getCutter(cutterId).generate(
          { uri, width: imageWidth, height: imageHeight },
          {
            difficulty,
            boardMaxWidth: frame.width,
            boardMaxHeight: frame.height,
          },
        ),
      )
      .then((layout) => {
        if (current)
          setPreview({
            paths: layout.pieces.map((piece) => piece.path),
            width: layout.boardSize.width,
            height: layout.boardSize.height,
          });
      })
      .catch(() => {
        /* The setup screen owns any unavailable-cut explanation. */
      });
    return () => {
      current = false;
    };
  }, [
    uri,
    imageWidth,
    imageHeight,
    cutterId,
    difficulty,
    frame.width,
    frame.height,
  ]);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      onLayout={(event) => setFrame(event.nativeEvent.layout)}
    >
      {preview ? (
        <Canvas style={{ flex: 1 }}>
          <Group
            transform={[
              { translateX: (frame.width - preview.width) / 2 },
              { translateY: (frame.height - preview.height) / 2 },
            ]}
          >
            {preview.paths.map((source, index) => {
              const path = Skia.Path.MakeFromSVGString(source);
              return path ? (
                <Group key={index}>
                  <Path
                    path={path}
                    style="stroke"
                    strokeWidth={2.2}
                    color="rgba(20,17,13,0.7)"
                  />
                  <Path
                    path={path}
                    style="stroke"
                    strokeWidth={0.6}
                    color="rgba(255,249,234,0.65)"
                  />
                </Group>
              ) : null;
            })}
          </Group>
        </Canvas>
      ) : null}
    </View>
  );
}
