/**
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BenchSuite } from '@deepkit/bench';
import {
    Email,
    MaxLength,
    Maximum,
    MinLength,
    Minimum,
    Negative,
    Pattern,
    Positive,
    ValidationErrorItem,
    assert,
    guard,
    is,
    validate,
    validateFunction,
} from '@deepkit/type';

/**
 * Validation benchmark - comprehensive Deepkit type validation performance tests
 *
 * This benchmark tests:
 * - Different validation APIs (guard, validate, is, assert)
 * - Constraint validators (MinLength, MaxLength, Email, Pattern, Positive, Minimum, Maximum)
 * - Arrays of objects with constraints
 * - Deeply nested object validation
 * - Discriminated union validation
 * - Error collection overhead
 */

// ============================================================================
// Basic Model - Existing test model
// ============================================================================

interface Model {
    number: number;
    negNumber: number & Negative;
    maxNumber: number & Maximum<500>;
    strings: string[];
    longString: string;
    boolean: boolean;
    deeplyNested: {
        foo: string;
        num: number;
        bool: boolean;
    };
}

// Sample valid data for benchmarking
const validData = {
    number: 1,
    negNumber: -1,
    maxNumber: 200,
    strings: ['a', 'b', 'c'],
    longString:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Vivendum intellegat et qui, ei denique consequuntur vix. Semper aeterno percipit ut his, sea ex utinam referrentur repudiandae. No epicuri hendrerit consetetur sit, sit dicta adipiscing ex, in facete detracto deterruisset duo. Quot populo ad qui. Sit fugit nostrum et. Ad per diam dicant interesset, lorem iusto sensibus ut sed. No dicam aperiam vis. Pri posse graeco definitiones cu, id eam populo quaestio adipiscing, usu quod malorum te. Ex nam agam veri, dicunt efficiantur ad qui, ad legere adversarium sit. Commune platonem mel id, brute adipiscing duo an. Vivendum intellegat et qui, ei denique consequuntur vix. Offendit eleifend moderatius ex vix, quem odio mazim et qui, purto expetendis cotidieque quo cu, veri persius vituperata ei nec. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    boolean: true,
    deeplyNested: {
        foo: 'bar',
        num: 1,
        bool: false,
    },
};

// Sample invalid data for benchmarking invalid case
const invalidData = {
    ...validData,
    negNumber: 100, // Should be negative
};

// ============================================================================
// Complex Constraints Model
// ============================================================================

const EMAIL_REGEX = /^\S+@\S+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

interface ConstrainedUser {
    username: string & MinLength<3> & MaxLength<20> & Pattern<typeof USERNAME_REGEX>;
    email: Email;
    age: number & Positive & Minimum<13> & Maximum<120>;
    password: string & MinLength<8> & MaxLength<128>;
    bio?: string & MaxLength<500>;
}

const validConstrainedUser = {
    username: 'john_doe',
    email: 'john@example.com',
    age: 25,
    password: 'securePassword123',
    bio: 'Software developer',
};

const invalidConstrainedUser = {
    username: 'jo', // MinLength<3> violation
    email: 'invalid-email', // Email pattern violation
    age: -5, // Positive violation
    password: 'short', // MinLength<8> violation
    bio: 'x'.repeat(600), // MaxLength<500> violation
};

// ============================================================================
// Array Validation Model
// ============================================================================

interface Product {
    id: number & Positive;
    name: string & MinLength<1> & MaxLength<100>;
    price: number & Positive & Minimum<0.01>;
    quantity: number & Positive & Minimum<1> & Maximum<10000>;
}

interface Order {
    orderId: string & MinLength<5>;
    products: Product[];
    totalAmount: number & Positive;
}

const validOrder: Order = {
    orderId: 'ORD-12345',
    products: [
        { id: 1, name: 'Widget', price: 9.99, quantity: 5 },
        { id: 2, name: 'Gadget', price: 19.99, quantity: 3 },
        { id: 3, name: 'Doodad', price: 4.99, quantity: 10 },
    ],
    totalAmount: 159.85,
};

const invalidOrder = {
    orderId: 'ORD', // MinLength<5> violation
    products: [
        { id: -1, name: '', price: -9.99, quantity: 0 }, // Multiple violations
        { id: 2, name: 'Valid', price: 19.99, quantity: 3 },
        { id: 3, name: 'x'.repeat(200), price: 4.99, quantity: 20000 }, // name and quantity violations
    ],
    totalAmount: -100, // Positive violation
};

// Large array for array validation performance
const largeValidProductArray: Product[] = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    price: (i + 1) * 1.5,
    quantity: Math.min(i + 1, 100),
}));

// ============================================================================
// Deep Nested Model
// ============================================================================

interface Address {
    street: string & MinLength<5>;
    city: string & MinLength<2>;
    country: string & MinLength<2> & MaxLength<100>;
    postalCode: string & Pattern<typeof POSTAL_CODE_REGEX>;
}

const POSTAL_CODE_REGEX = /^[A-Z0-9]{3,10}$/i;

interface Company {
    name: string & MinLength<2>;
    headquarters: Address;
}

interface Department {
    name: string & MinLength<1>;
    budget: number & Positive;
}

interface Employee {
    name: string & MinLength<2>;
    email: Email;
    salary: number & Positive & Minimum<1000>;
}

interface DeepOrganization {
    company: Company;
    department: Department;
    team: {
        lead: Employee;
        members: Employee[];
    };
    metadata: {
        level1: {
            level2: {
                level3: {
                    value: number & Positive;
                };
            };
        };
    };
}

const validDeepOrg: DeepOrganization = {
    company: {
        name: 'Acme Corp',
        headquarters: {
            street: '123 Main Street',
            city: 'New York',
            country: 'United States',
            postalCode: '10001',
        },
    },
    department: {
        name: 'Engineering',
        budget: 1000000,
    },
    team: {
        lead: {
            name: 'Alice Smith',
            email: 'alice@acme.com',
            salary: 150000,
        },
        members: [
            { name: 'Bob Jones', email: 'bob@acme.com', salary: 100000 },
            { name: 'Carol White', email: 'carol@acme.com', salary: 95000 },
        ],
    },
    metadata: {
        level1: {
            level2: {
                level3: {
                    value: 42,
                },
            },
        },
    },
};

const invalidDeepOrg = {
    company: {
        name: 'A', // MinLength<2> violation
        headquarters: {
            street: '123', // MinLength<5> violation
            city: 'N', // MinLength<2> violation
            country: 'US',
            postalCode: '!@#$%', // Pattern violation
        },
    },
    department: {
        name: '',
        budget: -5000, // Positive violation
    },
    team: {
        lead: {
            name: 'A', // MinLength<2> violation
            email: 'not-an-email', // Email violation
            salary: 500, // Minimum<1000> violation
        },
        members: [
            { name: 'B', email: 'invalid', salary: -100 }, // Multiple violations
        ],
    },
    metadata: {
        level1: {
            level2: {
                level3: {
                    value: -10, // Positive violation
                },
            },
        },
    },
};

// ============================================================================
// Discriminated Union Model
// ============================================================================

interface TextMessage {
    type: 'text';
    content: string & MinLength<1> & MaxLength<1000>;
    sender: string & MinLength<1>;
}

interface ImageMessage {
    type: 'image';
    url: string & MinLength<10>;
    width: number & Positive;
    height: number & Positive;
    sender: string & MinLength<1>;
}

interface VideoMessage {
    type: 'video';
    url: string & MinLength<10>;
    duration: number & Positive;
    sender: string & MinLength<1>;
}

interface FileMessage {
    type: 'file';
    filename: string & MinLength<1>;
    size: number & Positive;
    mimeType: string & MinLength<3>;
    sender: string & MinLength<1>;
}

type Message = TextMessage | ImageMessage | VideoMessage | FileMessage;

const validTextMessage: Message = {
    type: 'text',
    content: 'Hello, World!',
    sender: 'user123',
};

const validImageMessage: Message = {
    type: 'image',
    url: 'https://example.com/image.png',
    width: 800,
    height: 600,
    sender: 'user123',
};

const validVideoMessage: Message = {
    type: 'video',
    url: 'https://example.com/video.mp4',
    duration: 120,
    sender: 'user123',
};

const validFileMessage: Message = {
    type: 'file',
    filename: 'document.pdf',
    size: 1024000,
    mimeType: 'application/pdf',
    sender: 'user123',
};

const invalidTextMessage = {
    type: 'text' as const,
    content: '', // MinLength<1> violation
    sender: '', // MinLength<1> violation
};

const invalidImageMessage = {
    type: 'image' as const,
    url: 'short', // MinLength<10> violation
    width: -100, // Positive violation
    height: 0, // Positive violation
    sender: 'user123',
};

// ============================================================================
// Benchmark
// ============================================================================

export default async function () {
    const suite = new BenchSuite('type/validation');

    // ========================================================================
    // EXISTING BENCHMARKS - guard<T>()
    // ========================================================================

    // Pre-compile the guard function
    const guardModel = guard<Model>();

    // Sanity checks
    if (!guardModel(validData)) {
        throw new Error('Valid data should pass validation');
    }
    if (guardModel(invalidData)) {
        throw new Error('Invalid data should fail validation');
    }

    // Benchmark: Validate valid data (common case)
    suite.add('guard (valid)', () => {
        guardModel(validData);
    });

    // Benchmark: Validate invalid data (error path)
    suite.add('guard (invalid)', () => {
        guardModel(invalidData);
    });

    // ========================================================================
    // NEW BENCHMARKS - validate() returns array of errors
    // ========================================================================

    const validateFn = validateFunction<Model>();

    // Sanity checks
    if (validateFn(validData).length !== 0) {
        throw new Error('validate() should return empty array for valid data');
    }
    if (validateFn(invalidData).length === 0) {
        throw new Error('validate() should return errors for invalid data');
    }

    suite.add('validate (valid)', () => {
        validateFn(validData);
    });

    suite.add('validate (invalid)', () => {
        validateFn(invalidData);
    });

    // ========================================================================
    // NEW BENCHMARKS - is() type guard with error collection
    // ========================================================================

    // is<T>() without error collection (just boolean check)
    suite.add('is (valid, no errors)', () => {
        is<Model>(validData);
    });

    suite.add('is (invalid, no errors)', () => {
        is<Model>(invalidData);
    });

    // is<T>() with error collection
    suite.add('is (valid, with errors)', () => {
        const errors: ValidationErrorItem[] = [];
        is<Model>(validData, undefined, errors);
    });

    suite.add('is (invalid, with errors)', () => {
        const errors: ValidationErrorItem[] = [];
        is<Model>(invalidData, undefined, errors);
    });

    // ========================================================================
    // NEW BENCHMARKS - assert() throws on invalid
    // ========================================================================

    suite.add('assert (valid)', () => {
        assert<Model>(validData);
    });

    suite.add('assert (invalid, try-catch)', () => {
        try {
            assert<Model>(invalidData);
        } catch {
            // Expected to throw
        }
    });

    // ========================================================================
    // NEW BENCHMARKS - Complex constraints
    // ========================================================================

    const guardConstrainedUser = guard<ConstrainedUser>();
    const validateConstrainedUser = validateFunction<ConstrainedUser>();

    // Sanity checks
    if (!guardConstrainedUser(validConstrainedUser)) {
        throw new Error('Valid constrained user should pass');
    }
    if (guardConstrainedUser(invalidConstrainedUser)) {
        throw new Error('Invalid constrained user should fail');
    }

    suite.add('constraints (valid)', () => {
        guardConstrainedUser(validConstrainedUser);
    });

    suite.add('constraints (invalid)', () => {
        guardConstrainedUser(invalidConstrainedUser);
    });

    suite.add('constraints validate (invalid)', () => {
        validateConstrainedUser(invalidConstrainedUser);
    });

    // ========================================================================
    // NEW BENCHMARKS - Array validation
    // ========================================================================

    const guardOrder = guard<Order>();
    const validateOrder = validateFunction<Order>();

    // Sanity checks
    if (!guardOrder(validOrder)) {
        throw new Error('Valid order should pass');
    }
    if (guardOrder(invalidOrder)) {
        throw new Error('Invalid order should fail');
    }

    suite.add('array objects (valid)', () => {
        guardOrder(validOrder);
    });

    suite.add('array objects (invalid)', () => {
        guardOrder(invalidOrder);
    });

    suite.add('array objects validate (invalid)', () => {
        validateOrder(invalidOrder);
    });

    // Large array validation
    const guardProductArray = guard<Product[]>();

    // Sanity check
    if (!guardProductArray(largeValidProductArray)) {
        throw new Error('Large product array should pass');
    }

    suite.add('large array (100 items)', () => {
        guardProductArray(largeValidProductArray);
    });

    // ========================================================================
    // NEW BENCHMARKS - Deep nested validation
    // ========================================================================

    const guardDeepOrg = guard<DeepOrganization>();
    const validateDeepOrg = validateFunction<DeepOrganization>();

    // Sanity checks
    if (!guardDeepOrg(validDeepOrg)) {
        throw new Error('Valid deep org should pass');
    }
    if (guardDeepOrg(invalidDeepOrg)) {
        throw new Error('Invalid deep org should fail');
    }

    suite.add('deep nested (valid)', () => {
        guardDeepOrg(validDeepOrg);
    });

    suite.add('deep nested (invalid)', () => {
        guardDeepOrg(invalidDeepOrg);
    });

    suite.add('deep nested validate (invalid)', () => {
        validateDeepOrg(invalidDeepOrg);
    });

    // ========================================================================
    // NEW BENCHMARKS - Union validation
    // ========================================================================

    const guardMessage = guard<Message>();
    const validateMessage = validateFunction<Message>();

    // Sanity checks for all union members
    if (!guardMessage(validTextMessage)) {
        throw new Error('Valid text message should pass');
    }
    if (!guardMessage(validImageMessage)) {
        throw new Error('Valid image message should pass');
    }
    if (!guardMessage(validVideoMessage)) {
        throw new Error('Valid video message should pass');
    }
    if (!guardMessage(validFileMessage)) {
        throw new Error('Valid file message should pass');
    }
    if (guardMessage(invalidTextMessage)) {
        throw new Error('Invalid text message should fail');
    }
    if (guardMessage(invalidImageMessage)) {
        throw new Error('Invalid image message should fail');
    }

    // Test different union variants
    suite.add('union text (valid)', () => {
        guardMessage(validTextMessage);
    });

    suite.add('union image (valid)', () => {
        guardMessage(validImageMessage);
    });

    suite.add('union video (valid)', () => {
        guardMessage(validVideoMessage);
    });

    suite.add('union file (valid)', () => {
        guardMessage(validFileMessage);
    });

    suite.add('union text (invalid)', () => {
        guardMessage(invalidTextMessage);
    });

    suite.add('union image (invalid)', () => {
        guardMessage(invalidImageMessage);
    });

    suite.add('union validate (invalid)', () => {
        validateMessage(invalidTextMessage);
    });

    // ========================================================================
    // NEW BENCHMARKS - Error collection overhead comparison
    // ========================================================================

    // Compare guard() vs validate() on valid data (minimal overhead case)
    // These use the same Model type for fair comparison
    suite.add('overhead: guard (valid)', () => {
        guardModel(validData);
    });

    suite.add('overhead: validate (valid)', () => {
        validateFn(validData);
    });

    // Compare guard() vs validate() on invalid data (shows error collection cost)
    suite.add('overhead: guard (invalid)', () => {
        guardModel(invalidData);
    });

    suite.add('overhead: validate (invalid)', () => {
        validateFn(invalidData);
    });

    // Compare with multiple errors using constrained user
    const manyErrorsData = {
        username: '', // 2 violations: MinLength + Pattern
        email: '', // Email violation
        age: -200, // 2 violations: Positive + Minimum
        password: '', // MinLength violation
        bio: 'x'.repeat(600), // MaxLength violation
    };

    suite.add('overhead: guard (many errors)', () => {
        guardConstrainedUser(manyErrorsData);
    });

    suite.add('overhead: validate (many errors)', () => {
        validateConstrainedUser(manyErrorsData);
    });

    return suite;
}
