import { useMemo } from 'react';
import { config } from '../../config/env';
import type { ApproximateLocation } from '../offline/types';
import { useSites } from '../sites/useSites';
import { useWalkData } from '../walk/useWalkData';

/**
 * Where the region's likely birds are asked for, without ever requesting the device position: the active place,
 * else the first saved one, else where the person's latest located song was heard, else the centre the deployment
 * was set up for. So a newcomer without an account or records still sees what to look for.
 */
export function useRegionPlace(): ApproximateLocation {
  const { sites, active } = useSites();
  const { pins } = useWalkData();
  const site = active ?? sites[0] ?? null;
  const latest = pins?.at(-1) ?? null;
  const latitude = site?.latitude ?? latest?.latitude ?? config.map.initialCenter[1];
  const longitude = site?.longitude ?? latest?.longitude ?? config.map.initialCenter[0];
  return useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
}
