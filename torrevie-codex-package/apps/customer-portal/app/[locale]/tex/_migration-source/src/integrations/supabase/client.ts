// Legacy compatibility shim while TEX modules are moved to the Neon API.
// It intentionally performs no network traffic.

type LegacyResponse<T = unknown> = {
  data: T;
  error: null;
  count: number | null;
};

const emptyList = (): LegacyResponse<unknown[]> => ({ data: [], error: null, count: 0 });
const emptyItem = (): LegacyResponse<null> => ({ data: null, error: null, count: null });

function createQueryStub(singleResult = false): any {
  let responseFactory: () => LegacyResponse = singleResult ? emptyItem : emptyList;
  const target: Record<string, (...args: unknown[]) => any> = {
    select: () => proxy,
    insert: () => proxy,
    update: () => proxy,
    upsert: () => proxy,
    delete: () => proxy,
    eq: () => proxy,
    neq: () => proxy,
    in: () => proxy,
    is: () => proxy,
    not: () => proxy,
    gte: () => proxy,
    lte: () => proxy,
    gt: () => proxy,
    lt: () => proxy,
    order: () => proxy,
    limit: () => proxy,
    range: () => proxy,
    single: () => {
      responseFactory = emptyItem;
      return proxy;
    },
    maybeSingle: () => {
      responseFactory = emptyItem;
      return proxy;
    },
    then: (resolve, reject) => Promise.resolve(responseFactory()).then(resolve, reject),
    catch: (reject) => Promise.resolve(responseFactory()).catch(reject),
    finally: (handler) => Promise.resolve(responseFactory()).finally(handler),
  };

  const proxy: any = new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property as string];
      return () => proxy;
    },
  });
  return proxy;
}

function createChannelStub(): any {
  const channel: any = {
    on: () => channel,
    subscribe: () => channel,
    unsubscribe: async () => ({ error: null }),
  };
  return channel;
}

export const supabase: any = {
  from: () => createQueryStub(),
  rpc: async () => emptyItem(),
  functions: {
    invoke: async () => emptyItem(),
  },
  storage: {
    from: () => ({
      upload: async () => emptyItem(),
      remove: async () => emptyList(),
      createSignedUrl: async () => ({ data: null, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    }),
  },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    verifyOtp: async () => ({ data: null, error: null }),
  },
  channel: () => createChannelStub(),
  removeChannel: async () => ({ error: null }),
};
