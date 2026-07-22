import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  backupsApi,
  schedulesApi,
  tenantsApi,
  type BackupLog,
  type ContainerState,
  type Schedule,
  type Tenant,
} from "../api/client";

export interface TenantWithHealth extends Tenant {
  container: ContainerState | null;
}

export interface TenantBackups {
  tenantId: string;
  tenantName: string;
  backups: BackupLog[];
}

export interface FleetData {
  tenants: TenantWithHealth[];
  backups: TenantBackups[];
  schedules: Schedule[];
}

interface FleetState {
  data: FleetData | null;
  loading: boolean;
  error: string | null;
}

const REFRESH_INTERVAL_MS = 30_000;

export function extractApiError(err: unknown, fallback: string): string {
  const maybe = err as { response?: { data?: { error?: string } }; message?: string };
  return maybe.response?.data?.error ?? maybe.message ?? fallback;
}

/** HTTP status of a failed axios request, if any (undefined for network/timeout errors with no response). */
export function getHttpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } }).response?.status;
}

async function fetchFleet(): Promise<FleetData> {
  const [tenants, schedules] = await Promise.all([tenantsApi.list(), schedulesApi.list()]);

  const [statuses, backupLists] = await Promise.all([
    Promise.allSettled(tenants.map((t) => tenantsApi.status(t.id))),
    Promise.allSettled(tenants.map((t) => backupsApi.list(t.id))),
  ]);

  const withHealth: TenantWithHealth[] = tenants.map((tenant, i) => {
    const result = statuses[i];
    return {
      ...tenant,
      container: result.status === "fulfilled" ? result.value.container : null,
    };
  });

  const backups: TenantBackups[] = tenants.map((tenant, i) => {
    const result = backupLists[i];
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      backups: result.status === "fulfilled" ? result.value : [],
    };
  });

  return { tenants: withHealth, backups, schedules };
}

/** Loads the whole fleet snapshot (tenants + health + backups + schedules) and refreshes it periodically. */
export function useFleetData(): FleetState & { reload: () => Promise<void> } {
  const { t } = useTranslation();
  const [state, setState] = useState<FleetState>({ data: null, loading: true, error: null });
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await fetchFleet();
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState((prev) => ({
        data: prev.data,
        loading: false,
        error: extractApiError(err, t("common.loadError")),
      }));
    } finally {
      inFlight.current = false;
    }
  }, [t]);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [reload]);

  return { ...state, reload };
}
