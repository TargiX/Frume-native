import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PhotoApiError,
  requestPhotoApi,
  throwPhotoApiResponseError,
  withPhotoApiRequestDeadline,
} from './photoApi';
import { PhotoUseQueue, type PhotoUseEvent } from './photoUseQueue';
import {
  normalizePhotoTrackingToken,
  normalizeUnsplashDownloadLocation,
} from './photoValidation';

type TrackablePhoto = {
  links?: { download_location?: string };
};

export async function sendPhotoUse(event: PhotoUseEvent): Promise<void> {
  await withPhotoApiRequestDeadline(async (requestSignal) => {
    const response = await requestPhotoApi('track', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
      signal: requestSignal,
    });
    if (!response.ok) {
      await throwPhotoApiResponseError(response);
    }
  });
}

const photoUseQueue = new PhotoUseQueue(AsyncStorage, sendPhotoUse);

function photoUseEventFrom(
  photo: TrackablePhoto,
  trackingToken: unknown,
): PhotoUseEvent | null {
  const locationValue = photo.links?.download_location;
  if (locationValue === undefined && trackingToken === undefined) {
    return null;
  }
  const downloadLocation =
    normalizeUnsplashDownloadLocation(locationValue);
  if (!downloadLocation) {
    throw new PhotoApiError(
      'Photo service returned an invalid download location',
      'invalid_response',
    );
  }
  const normalizedTrackingToken =
    normalizePhotoTrackingToken(trackingToken);
  if (!normalizedTrackingToken) {
    throw new PhotoApiError(
      'Photo service returned an invalid tracking token',
      'invalid_response',
    );
  }
  return {
    downloadLocation,
    trackingToken: normalizedTrackingToken,
  };
}

async function persistPhotoUse(event: PhotoUseEvent): Promise<void> {
  const accepted = await photoUseQueue.enqueue(event);
  if (!accepted) {
    // Preserve every older durable event, but let an online device make room
    // before the user retries the setup action.
    void photoUseQueue.flush().catch(() => undefined);
    throw new PhotoApiError(
      'Too many photo uses are waiting to be registered',
      'queue_full',
    );
  }
}

/**
 * Reports a real photo use through the server-side Unsplash proxy.
 *
 * The location is durable before the network request starts. Failures still
 * reject truthfully, preserving the existing API contract, while the item
 * remains queued for a later retry.
 */
export async function trackPhotoUse(
  photo: TrackablePhoto,
  trackingToken?: string,
): Promise<void> {
  const event = photoUseEventFrom(photo, trackingToken);
  if (!event) {
    return;
  }

  await persistPhotoUse(event);
  await photoUseQueue.flush();
}

/**
 * Persists a real use, starts a best-effort background send, and resolves as
 * soon as the local enqueue finishes. This is the play-start integration.
 */
export async function enqueuePhotoUse(
  photo: TrackablePhoto,
  trackingToken?: string,
): Promise<void> {
  const event = photoUseEventFrom(photo, trackingToken);
  if (!event) {
    return;
  }

  await persistPhotoUse(event);
  void photoUseQueue.flush().catch(() => undefined);
}

/** Retry all durable pending uses, normally once during app startup. */
export async function retryPendingPhotoUses(): Promise<void> {
  await photoUseQueue.flush();
}
