// The model and data of the comparison benchmarks. Every library validates the same structure.
export interface User {
    id: number;
    email: string;
    name: string;
    age: number;
    active: boolean;
    roles: string[];
    profile: {
        bio: string;
        website: string;
        social: {
            twitter?: string;
            github?: string;
        };
    };
}

export function createUser(i: number = 0): User {
    return {
        id: i + 1,
        email: `peter${i}@example.com`,
        name: 'Peter ' + i,
        age: 20 + i,
        active: true,
        roles: ['admin', 'user'],
        profile: {
            bio: 'Developer',
            website: 'https://example.com',
            social: { twitter: '@peter', github: 'peter' },
        },
    };
}

/** Invalid in a nested field, so validators have to check most of the object. */
export function createInvalidUser(i: number = 0): any {
    const user: any = createUser(i);
    user.profile.social.github = 42;
    return user;
}

/**
 * Returns a function that returns the next of `count` objects on each call. Benchmarks use different objects,
 * since V8 can move the work for an unchanged object out of the benchmark loop.
 */
export function rotate<T>(create: (i: number) => T, count: number = 16): () => T {
    const items = Array.from({ length: count }, (_, i) => create(i));
    let i = 0;
    return () => items[i++ & (count - 1)];
}
