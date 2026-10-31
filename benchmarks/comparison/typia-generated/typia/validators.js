import * as _jsonStringifyNumber_1 from "typia/lib/internal/_jsonStringifyNumber";
import * as _jsonStringifyString_1 from "typia/lib/internal/_jsonStringifyString";
import * as _jsonStringifyArray_1 from "typia/lib/internal/_jsonStringifyArray";
import * as _jsonStringifyTail_1 from "typia/lib/internal/_jsonStringifyTail";
import * as _validateReport_1 from "typia/lib/internal/_validateReport";
import * as _createStandardSchema_1 from "typia/lib/internal/_createStandardSchema";
// Source of typia-generated/validators.ts, regenerate with `npm run bench:typia` (typia needs its own compiler step).
import typia from 'typia';
export const isUser = (() => {
    const _io0 = input => "number" === typeof input.id && "string" === typeof input.email && "string" === typeof input.name && "number" === typeof input.age && "boolean" === typeof input.active && (Array.isArray(input.roles) && input.roles.every(elem => "string" === typeof elem)) && ("object" === typeof input.profile && null !== input.profile && _io1(input.profile));
    const _io1 = input => "string" === typeof input.bio && "string" === typeof input.website && ("object" === typeof input.social && null !== input.social && false === Array.isArray(input.social) && _io2(input.social));
    const _io2 = input => (undefined === input.twitter || "string" === typeof input.twitter) && (undefined === input.github || "string" === typeof input.github);
    return input => "object" === typeof input && null !== input && _io0(input);
})();
export const validateUser = (() => {
    const _io0 = input => "number" === typeof input.id && "string" === typeof input.email && "string" === typeof input.name && "number" === typeof input.age && "boolean" === typeof input.active && (Array.isArray(input.roles) && input.roles.every(elem => "string" === typeof elem)) && ("object" === typeof input.profile && null !== input.profile && _io1(input.profile));
    const _io1 = input => "string" === typeof input.bio && "string" === typeof input.website && ("object" === typeof input.social && null !== input.social && false === Array.isArray(input.social) && _io2(input.social));
    const _io2 = input => (undefined === input.twitter || "string" === typeof input.twitter) && (undefined === input.github || "string" === typeof input.github);
    const _vo0 = (input, _path, _exceptionable = true) => ["number" === typeof input.id || _report(_exceptionable, {
            path: _path + ".id",
            expected: "number",
            value: input.id
        }), "string" === typeof input.email || _report(_exceptionable, {
            path: _path + ".email",
            expected: "string",
            value: input.email
        }), "string" === typeof input.name || _report(_exceptionable, {
            path: _path + ".name",
            expected: "string",
            value: input.name
        }), "number" === typeof input.age || _report(_exceptionable, {
            path: _path + ".age",
            expected: "number",
            value: input.age
        }), "boolean" === typeof input.active || _report(_exceptionable, {
            path: _path + ".active",
            expected: "boolean",
            value: input.active
        }), (Array.isArray(input.roles) || _report(_exceptionable, {
            path: _path + ".roles",
            expected: "Array<string>",
            value: input.roles
        })) && input.roles.map((elem, _index2) => "string" === typeof elem || _report(_exceptionable, {
            path: _path + ".roles[" + _index2 + "]",
            expected: "string",
            value: elem
        })).every(flag => flag) || _report(_exceptionable, {
            path: _path + ".roles",
            expected: "Array<string>",
            value: input.roles
        }), ("object" === typeof input.profile && null !== input.profile || _report(_exceptionable, {
            path: _path + ".profile",
            expected: "{ bio: string; website: string; social: { twitter?: string | undefined; github?: string | undefined; }; }",
            value: input.profile
        })) && _vo1(input.profile, _path + ".profile", true && _exceptionable) || _report(_exceptionable, {
            path: _path + ".profile",
            expected: "{ bio: string; website: string; social: { twitter?: string | undefined; github?: string | undefined; }; }",
            value: input.profile
        })].every(flag => flag);
    const _vo1 = (input, _path, _exceptionable = true) => ["string" === typeof input.bio || _report(_exceptionable, {
            path: _path + ".bio",
            expected: "string",
            value: input.bio
        }), "string" === typeof input.website || _report(_exceptionable, {
            path: _path + ".website",
            expected: "string",
            value: input.website
        }), ("object" === typeof input.social && null !== input.social && false === Array.isArray(input.social) || _report(_exceptionable, {
            path: _path + ".social",
            expected: "{ twitter?: string | undefined; github?: string | undefined; }",
            value: input.social
        })) && _vo2(input.social, _path + ".social", true && _exceptionable) || _report(_exceptionable, {
            path: _path + ".social",
            expected: "{ twitter?: string | undefined; github?: string | undefined; }",
            value: input.social
        })].every(flag => flag);
    const _vo2 = (input, _path, _exceptionable = true) => [undefined === input.twitter || "string" === typeof input.twitter || _report(_exceptionable, {
            path: _path + ".twitter",
            expected: "(string | undefined)",
            value: input.twitter
        }), undefined === input.github || "string" === typeof input.github || _report(_exceptionable, {
            path: _path + ".github",
            expected: "(string | undefined)",
            value: input.github
        })].every(flag => flag);
    const __is = input => "object" === typeof input && null !== input && _io0(input);
    let errors;
    let _report;
    return _createStandardSchema_1._createStandardSchema(input => {
        if (false === __is(input)) {
            errors = [];
            _report = _validateReport_1._validateReport(errors);
            ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || _report(true, {
                path: _path + "",
                expected: "User",
                value: input
            })) && _vo0(input, _path + "", true) || _report(true, {
                path: _path + "",
                expected: "User",
                value: input
            }))(input, "$input", true);
            const success = 0 === errors.length;
            return success ? {
                success,
                data: input
            } : {
                success,
                errors,
                data: input
            };
        }
        return {
            success: true,
            data: input
        };
    });
})();
export const stringifyUser = (() => {
    const _so0 = input => `{"id":${String(_jsonStringifyNumber_1._jsonStringifyNumber(input.id))},"email":${_jsonStringifyString_1._jsonStringifyString(input.email)},"name":${_jsonStringifyString_1._jsonStringifyString(input.name)},"age":${String(_jsonStringifyNumber_1._jsonStringifyNumber(input.age))},"active":${String(input.active)},"roles":${`[${_jsonStringifyArray_1._jsonStringifyArray(input.roles, elem => _jsonStringifyString_1._jsonStringifyString(elem))}]`},"profile":${_so1(input.profile)}}`;
    const _so1 = input => `{"bio":${_jsonStringifyString_1._jsonStringifyString(input.bio)},"website":${_jsonStringifyString_1._jsonStringifyString(input.website)},"social":${_so2(input.social)}}`;
    const _so2 = input => `{${_jsonStringifyTail_1._jsonStringifyTail(`${undefined === input.twitter ? "" : `"twitter":${undefined !== input.twitter ? _jsonStringifyString_1._jsonStringifyString(input.twitter) : undefined},`}${undefined === input.github ? "" : `"github":${undefined !== input.github ? _jsonStringifyString_1._jsonStringifyString(input.github) : undefined}`}`)}}`;
    const _io1 = input => "string" === typeof input.bio && "string" === typeof input.website && ("object" === typeof input.social && null !== input.social && false === Array.isArray(input.social) && _io2(input.social));
    const _io2 = input => (undefined === input.twitter || "string" === typeof input.twitter) && (undefined === input.github || "string" === typeof input.github);
    return input => _so0(input);
})();
