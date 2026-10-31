export function createUser(i = 0) {
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
export function createInvalidUser(i = 0) {
    const user = createUser(i);
    user.profile.social.github = 42;
    return user;
}
/**
 * Returns a function that returns the next of `count` objects on each call. Benchmarks use different objects,
 * since V8 can move the work for an unchanged object out of the benchmark loop.
 */
export function rotate(create, count = 16) {
    const items = Array.from({ length: count }, (_, i) => create(i));
    let i = 0;
    return () => items[i++ & (count - 1)];
}
