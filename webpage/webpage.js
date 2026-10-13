const code = document.querySelector('#code');
const status = document.querySelector('#status');
const output = document.querySelector('#output');
const humanOutput = document.querySelector('#human-output');
const humanOutputCard = humanOutput.closest('.card');

const identitySearch = document.querySelector('#identity-search');
const identityResults = document.querySelector('#identity-results');

const identityBackdrop =
document.createElement('div');

identityBackdrop.id =
'identity-search-backdrop';

document.body.appendChild(
    identityBackdrop
);

// HAERICODE

function run(canonicalize = false) {
    try {
        const parsed = Haericode.parse(code.value);

        if (canonicalize) {
            code.value = Haericode.canonicalize(parsed);
        }

        const inspected =
        Haericode.inspect(parsed);

        status.className = 'ok';
        status.textContent = 'Valid Haericode';

        renderHumanOutput(
            inspected
        );

        output.textContent =
        JSON.stringify(
            inspected,
            null,
            2
        );
    }

    catch (e) {
        status.className = 'err';
        status.textContent = e.message;
        humanOutput.innerHTML = '';
        humanOutputCard.style.display = 'none';
        output.textContent = '{}';
    }
}

document.querySelector('#validate').onclick =
() => run(false);

document.querySelector('#canonicalize').onclick =
() => run(true);

document.querySelector('#examples').onchange =
e => {
    if (e.target.value) {
        try {
            navigator.clipboard.writeText(
                e.target.value
            );

            showIdentityCopyFeedback(
                `Copied ${e.target.value}`
            );

        }

        catch (e) {
            showIdentityCopyFeedback(
                'Could not copy'
            );
        }
    }
};

// IDENTITY SEARCH

function getIdentityRecords() {
    const identities =
    HaericodeOntology.identities;

    return Object.keys(identities)
    .map(
        code =>
        identities[code]
    );
}

function getAliases(identity) {
    return Array.isArray(identity.aliases)
    ? identity.aliases
    : [];
}

function identitySearchText(identity) {
    return [
        identity.code,
        identity.name,
        ...getAliases(identity)
    ]
    .join(' ')
    .toLocaleLowerCase();
}

// RELATIONSHIP HELPERS

function getRelationships(identity) {
    if (
        !identity ||
        !Array.isArray(identity.relationships)
    ) {
        return [];
    }

    const result = [];

    for (
        const relationship
        of identity.relationships
    ) {
        if (
            !relationship ||
            typeof relationship !== 'object'
        ) {
            continue;
        }

        if (
            typeof relationship.identity === 'string' &&
            relationship.identity
        ) {
            result.push(
                relationship
            );

            continue;
        }

        let type =
        relationship.type;

        if (
            type === 'classifications'
        ) {
            type =
            'classification';
        }

        else if (
            type === 'broaderIdentities'
        ) {
            type =
            'broaderIdentity';
        }

        if (
            !Array.isArray(
                relationship.code
            )
        ) {
            continue;
        }

        for (
            const code
            of relationship.code
        ) {
            if (
                typeof code !== 'string' ||
                !code
            ) {
                continue;
            }

            const related =
            HaericodeOntology.get(
                code
            );


            result.push({
                type,

                identity:
                code,

                name:
                related?.name ||
                code,

                relationships:
                Array.isArray(
                    related?.relationships
                )
                ? related.relationships
                : []
            });
        }
    }

    return result;
}

function getBroaderIdentityRelationships(identity) {
    return getRelationships(identity)
    .filter(
        relation =>
        isBroaderIdentityRelationship(
            relation
        )
    );
}

function getRelationshipIdentityCode(relation) {
    return relation?.identity || null;
}

function isBroaderIdentityRelationship(relation) {
    return relation?.type === 'broaderIdentity';
}

function getClassificationRelationships(identity) {
    return getRelationships(identity)
    .filter(
        relation =>
        relation.type === 'classification'
    );
}

function getInheritedRelationships(
    identity,
    visited = new Set(),
                                   relationshipMap = new Map()
) {
    if (!identity) {
        return [];
    }

    if (
        visited.has(identity.code)
    ) {
        return [
            ...relationshipMap.values()
        ];
    }

    const nextVisited =
    new Set(visited);

    nextVisited.add(
        identity.code
    );

    const relationships =
    getRelationships(identity);

    for (
        const relation
        of relationships
    ) {
        const relationCode =
        getRelationshipIdentityCode(
            relation
        );

        if (!relationCode) {
            continue;
        }

        const key =
        `${relation.type}:${relationCode}`;

        if (
            !relationshipMap.has(key)
        ) {
            relationshipMap.set(
                key,
                relation
            );
        }
    }

    for (
        const relation
        of relationships
    ) {
        if (
            !isBroaderIdentityRelationship(
                relation
            )
        ) {
            continue;
        }

        const broaderCode =
        getRelationshipIdentityCode(
            relation
        );

        if (!broaderCode) {
            continue;
        }

        if (
            Array.isArray(
                relation.relationships
            ) &&
            relation.relationships.length
        ) {
            const nestedIdentity = {
                code:
                broaderCode,

                name:
                relation.name ||
                humanIdentityName(
                    broaderCode
                ),

                relationships:
                relation.relationships
            };

            getInheritedRelationships(
                nestedIdentity,
                nextVisited,
                relationshipMap
            );

            continue;
        }

        const broader =
        HaericodeOntology.get(
            broaderCode
        );

        if (!broader) {
            continue;
        }

        getInheritedRelationships(
            broader,
            nextVisited,
            relationshipMap
        );
    }

    return [
        ...relationshipMap.values()
    ];
}

function isDescendantOf(
    identityCode,
    ancestorCode,
    visited = new Set()
) {
    if (
        identityCode === ancestorCode
    ) {
        return true;
    }

    if (
        visited.has(identityCode)
    ) {
        return false;
    }

    visited.add(identityCode);

    const identity =
    HaericodeOntology.get(
        identityCode
    );

    if (!identity) {
        return false;
    }

    for (
        const relation
        of getBroaderIdentityRelationships(
            identity
        )
    ) {
        const broaderCode =
        getRelationshipIdentityCode(
            relation
        );

        if (!broaderCode) {
            continue;
        }

        if (
            broaderCode === ancestorCode
        ) {
            return true;
        }

        if (
            isDescendantOf(
                broaderCode,
                ancestorCode,
                new Set(visited)
            )
        ) {
            return true;
        }
    }

    return false;
}

// SEARCH MATCH TYPES

function isDirectIdentityMatch(
    identity,
    query
) {
    return identitySearchText(
        identity
    ).includes(query);
}

function relationshipMatchesQuery(
    relation,
    query
) {
    const relationCode =
    getRelationshipIdentityCode(
        relation
    );

    if (!relationCode) {
        return false;
    }

    const candidates = [
        relation.name,
        relationCode
    ];

    const related =
    HaericodeOntology.get(
        relationCode
    );

    if (related) {
        candidates.push(
            related.name,
            ...getAliases(related)
        );
    }

    return candidates
    .filter(Boolean)
    .some(
        value =>
        String(value)
        .toLocaleLowerCase()
        .includes(query)
    );
}

function findDirectIdentityMatches(
    query
) {
    return getIdentityRecords()
    .filter(
        identity =>
        isDirectIdentityMatch(
            identity,
            query
        )
    );
}

function findClassificationMatches(
    query
) {
    return getIdentityRecords()
    .filter(
        identity =>
        getClassificationRelationships(
            identity
        )
        .some(
            relation =>
            relationshipMatchesQuery(
                relation,
                query
            )
        )
    );
}

function findBroaderIdentityMatches(
    query
) {
    const directMatches =
    findDirectIdentityMatches(
        query
    );

    const result =
    new Map();

    for (
        const ancestor
        of directMatches
    ) {
        for (
            const identity
            of getIdentityRecords()
        ) {
            if (
                identity.code ===
                ancestor.code
            ) {
                continue;
            }

            if (
                isDescendantOf(
                    identity.code,
                    ancestor.code
                )
            ) {
                result.set(
                    identity.code,
                    identity
                );
            }
        }
    }

    return [
        ...result.values()
    ];
}

function findIdentityMatches(query) {
    const records =
    getIdentityRecords();

    const matches =
    new Map();

    for (
        const identity
        of records
    ) {
        if (
            isDirectIdentityMatch(
                identity,
                query
            )
        ) {
            matches.set(
                identity.code,
                {
                    identity,
                    matchType: 'direct'
                }
            );
        }
    }

    const broaderMatches =
    findBroaderIdentityMatches(
        query
    );

    for (
        const identity
        of broaderMatches
    ) {
        if (
            !matches.has(
                identity.code
            )
        ) {
            matches.set(
                identity.code,
                {
                    identity,
                    matchType: 'broader'
                }
            );
        }
    }

    const classificationMatches =
    findClassificationMatches(
        query
    );

    for (
        const identity
        of classificationMatches
    ) {
        if (
            !matches.has(
                identity.code
            )
        ) {
            matches.set(
                identity.code,
                {
                    identity,
                    matchType: 'classification'
                }
            );
        }
    }

    return [
        ...matches.values()
    ];
}

// SEARCH RELEVANCE

function textRelevance(
    text,
    query
) {
    const value =
    String(text || '')
    .toLocaleLowerCase();

    if (
        value === query
    ) {
        return 0;
    }

    if (
        value.startsWith(query)
    ) {
        return 1;
    }

    if (
        value.includes(query)
    ) {
        return 2;
    }

    return 3;
}

function relationshipRelevance(
    relation,
    query
) {
    const relationCode =
    getRelationshipIdentityCode(
        relation
    );

    if (!relationCode) {
        return 999;
    }

    const related =
    HaericodeOntology.get(
        relationCode
    );

    const candidates = [
        relation.name,
        relationCode
    ];

    if (related) {
        candidates.push(
            related.name,
            ...getAliases(related)
        );
    }

    return Math.min(
        ...candidates
        .filter(Boolean)
        .map(
            value =>
            textRelevance(
                value,
                query
            )
        )
    );
}

function sortIdentityRelationships(
    identityOrRelationships,
    query
) {

    const relationships =
    Array.isArray(
        identityOrRelationships
    )
    ? identityOrRelationships
    : getRelationships(
        identityOrRelationships
    );


    return [
        ...relationships
    ].sort(
        (a, b) => {

            const aBroader =
            isBroaderIdentityRelationship(a);

            const bBroader =
            isBroaderIdentityRelationship(b);

            if (
                aBroader &&
                !bBroader
            ) {
                return -1;
            }

            if (
                !aBroader &&
                bBroader
            ) {
                return 1;
            }

            const aRelevance =
            relationshipRelevance(
                a,
                query
            );

            const bRelevance =
            relationshipRelevance(
                b,
                query
            );

            if (
                aRelevance !==
                bRelevance
            ) {
                return (
                    aRelevance -
                    bRelevance
                );
            }

            const aCode =
            getRelationshipIdentityCode(a);

            const bCode =
            getRelationshipIdentityCode(b);

            const aRelated =
            HaericodeOntology.get(
                aCode
            );

            const bRelated =
            HaericodeOntology.get(
                bCode
            );

            return (
                (
                    a.name ||
                    aRelated?.name ||
                    aCode ||
                    ''
                ).localeCompare(
                    b.name ||
                    bRelated?.name ||
                    bCode ||
                    ''
                )
            );
        }
    );
}

function getNonEuropeanMatchScore(
    identity,
    query
) {
    if (
        !identity.code.startsWith('@')
    ) {
        return 999;
    }


    const name =
    identity.name
    .toLocaleLowerCase();

    const code =
    identity.code
    .toLocaleLowerCase();

    const aliases =
    getAliases(identity);

    if (
        name === query ||
        code === query
    ) {
        return 0;
    }

    if (
        aliases.some(
            alias =>
            alias
            .toLocaleLowerCase() === query
        )
    ) {
        return 0;
    }

    if (
        name.startsWith(query) ||
        code.startsWith(query)
    ) {
        return 1;
    }

    if (
        aliases.some(
            alias =>
            alias
            .toLocaleLowerCase()
            .startsWith(query)
        )
    ) {
        return 1;
    }

    const relationshipMatch =
    getRelationships(identity)
    .some(
        relation => {

            const relationCode =
            getRelationshipIdentityCode(
                relation
            );

            if (!relationCode) {
                return false;
            }

            const related =
            HaericodeOntology.get(
                relationCode
            );

            const relatedName =
            (
                relation.name ||
                related?.name ||
                ''
            )
            .toLocaleLowerCase();

            const relatedCode =
            relationCode
            .toLocaleLowerCase();

            return (
                relatedName === query ||
                relatedCode === query ||
                relatedName.startsWith(query) ||
                relatedCode.startsWith(query)
            );
        }
    );


    if (
        relationshipMatch
    ) {
        return 2;
    }


    return 999;
}

// SEARCH RESULT SORTING

function sortIdentityMatches(
    matches,
    query
) {
    return matches.sort(
        (a, b) => {

            const identityA =
            a.identity;

            const identityB =
            b.identity;


            const aSpecial =
            identityA.code.startsWith('@');

            const bSpecial =
            identityB.code.startsWith('@');

            if (
                aSpecial &&
                !bSpecial
            ) {
                return 1;
            }

            if (
                !aSpecial &&
                bSpecial
            ) {
                return -1;
            }

            const matchPriority = {
                direct: 0,
                broader: 1,
                classification: 2
            };

            const aPriority =
            matchPriority[
                a.matchType
            ];

            const bPriority =
            matchPriority[
                b.matchType
            ];

            if (
                aPriority !==
                bPriority
            ) {
                return (
                    aPriority -
                    bPriority
                );
            }

            const aName =
            identityA.name || '';

            const bName =
            identityB.name || '';

            const aCode =
            identityA.code || '';

            const bCode =
            identityB.code || '';

            const aRelevance =
            Math.min(
                textRelevance(
                    aName,
                    query
                ),
                textRelevance(
                    aCode,
                    query
                ),
                ...getAliases(
                    identityA
                ).map(
                    alias =>
                    textRelevance(
                        alias,
                        query
                    )
                )
            );

            const bRelevance =
            Math.min(
                textRelevance(
                    bName,
                    query
                ),
                textRelevance(
                    bCode,
                    query
                ),
                ...getAliases(
                    identityB
                ).map(
                    alias =>
                    textRelevance(
                        alias,
                        query
                    )
                )
            );

            if (
                aRelevance !==
                bRelevance
            ) {
                return (
                    aRelevance -
                    bRelevance
                );
            }

            return aName.localeCompare(
                bName
            );
        }
    );
}

// SEARCH UI

function openIdentitySearch() {
    identityResults.classList.add(
        'visible'
    );

    identityBackdrop.classList.add(
        'visible'
    );
}

function closeIdentitySearch() {
    identityResults.classList.remove(
        'visible'
    );

    identityBackdrop.classList.remove(
        'visible'
    );
}

// RELATIONSHIP DISPLAY

function relationLabel(relation) {
    const relationCode =
    getRelationshipIdentityCode(
        relation
    );

    if (
        relation.name
    ) {
        return relation.name;
    }

    const related =
    HaericodeOntology.get(
        relationCode
    );

    return related
    ? related.name
    : String(
        relationCode || ''
    );
}

// COPY FEEDBACK

function showIdentityCopyFeedback(
    message
) {
    let feedback =
    document.querySelector(
        '#identity-copy-feedback'
    );

    if (!feedback) {
        feedback =
        document.createElement('div');

        feedback.id =
        'identity-copy-feedback';

        document.body.appendChild(
            feedback
        );
    }

    feedback.textContent =
    message;

    feedback.classList.remove(
        'visible'
    );

    void feedback.offsetWidth;

    feedback.classList.add(
        'visible'
    );

    clearTimeout(
        feedback._hideTimer
    );

    feedback._hideTimer =
    setTimeout(
        () => {
            feedback.classList.remove(
                'visible'
            );
        },
        1400
    );
}

// IDENTITY CODE OPTIONS

function getIdentityCodeOptions(
    identity
) {
    const options = [];

    const seen =
    new Set();

    function addOption(
        codes,
        names
    ) {
        const code =
        codes.join('-');

        if (
            seen.has(code)
        ) {
            return;
        }

        seen.add(code);

        options.push({
            code,

            name:
            names.join(', ')
        });
    }

    function walk(
        currentIdentity,
        codes,
        names,
        visited
    ) {
        addOption(
            codes,
            names
        );

        const currentCode =
        currentIdentity.code;

        if (
            visited.has(currentCode)
        ) {
            return;
        }

        const nextVisited =
        new Set(visited);

        nextVisited.add(
            currentCode
        );

        const broader =
        getBroaderIdentityRelationships(
            currentIdentity
        );

        for (
            const relation
            of broader
        ) {
            const broaderCode =
            getRelationshipIdentityCode(
                relation
            );

            if (
                !broaderCode
            ) {
                continue;
            }

            const broaderIdentity =
            HaericodeOntology.get(
                broaderCode
            );

            if (
                !broaderIdentity
            ) {
                continue;
            }

            walk(
                broaderIdentity,

                 [
                     ...codes,
                 broaderCode
                 ],

                 [
                     ...names,
                 broaderIdentity.name
                 ],

                 nextVisited
            );
        }
    }

    walk(
        identity,

         [
             identity.code
         ],

         [
             identity.name
         ],

         new Set()
    );

    return options;
}

// IDENTITY CODE SELECTION POPUP

let identityCodePopup = null;

function createIdentityCodePopup() {
    if (
        identityCodePopup
    ) {
        return identityCodePopup;
    }

    const popup =
        document.createElement('div');

    popup.id =
        'identity-code-popup';

    popup.className =
        'identity-code-popup';

    popup.style.display =
        'none';

    document.body.appendChild(
        popup
    );

    identityCodePopup =
        popup;

    return popup;
}

function closeIdentityCodePopup() {
    if (
        !identityCodePopup
    ) {
        return;
    }

    identityCodePopup.style.display =
    'none';

    identityCodePopup.innerHTML = '';

    identitySearch.style.display =
    '';

    identityResults.classList.remove(
        'visible'
    );
}

function showIdentityCodePopup(identity) {
    const popup =
    createIdentityCodePopup();

    const options =
    getIdentityCodeOptions(identity);

    if (
        options.length === 1
    ) {
        return copyIdentityCode(
            options[0].code
        );
    }

    identitySearch.style.display =
    'none';

    identityResults.classList.remove(
        'visible'
    );

    popup.innerHTML = '';

    popup.classList.add(
        'identity-code-popup'
    );

    const title =
    document.createElement('div');

    title.className =
    'identity-code-popup-title';

    title.textContent =
    'Choose an identity code';

    const subtitle =
    document.createElement('div');

    subtitle.className =
    'identity-code-popup-subtitle';

    subtitle.textContent =
    'Choose how you want to represent this identity.';

    popup.appendChild(
        title
    );

    popup.appendChild(
        subtitle
    );

    const optionsContainer =
    document.createElement('div');

    optionsContainer.className =
    'identity-code-options';

    for (
        const option
        of options
    ) {
        const button =
        document.createElement('button');

        button.type =
        'button';

    button.className =
    'identity-code-option';

        const code =
        document.createElement('strong');

        code.className =
        'identity-code-option-code';

        code.textContent =
        option.code;


        const name =
        document.createElement('span');

        name.className =
        'identity-code-option-name';

        name.textContent =
        ` (${option.name})`;

        button.appendChild(
            code
        );

        button.appendChild(
            name
        );

        button.addEventListener(
            'click',
            () => {
                copyIdentityCode(
                    option.code
                );
            }
        );

        optionsContainer.appendChild(
            button
        );
    }

    popup.appendChild(
        optionsContainer
    );

    popup.style.display =
    'block';
}

async function copyIdentityCode(
    code
) {
    try {
        await navigator.clipboard.writeText(
            code
        );

        showIdentityCopyFeedback(
            `Copied ${code}`
        );

        closeIdentityCodePopup();

        closeIdentitySearch();

        identitySearch.value =
        '';
    }

    catch (e) {
        showIdentityCopyFeedback(
            'Could not copy'
        );
    }
}

// RESULT CREATION

function createIdentityResult(
    identity,
    query = '',
    isTopResult = false
) {
    const result =
    document.createElement('div');

    result.className =
    'identity-result';

    if (isTopResult) {
        result.classList.add(
            'identity-result-top'
        );
    }


    const aliases =
    getAliases(identity);

    const header =
    document.createElement('div');

    header.className =
    'identity-result-header';


    const nameArea =
    document.createElement('div');

    nameArea.className =
    'identity-result-name-area';

    if (
        identity.code.startsWith('@')
    ) {
        const nonEuropean =
        document.createElement('span');

        nonEuropean.className =
        'identity-non-european';

    nonEuropean.textContent =
    'NON EUROPEAN';

    nameArea.appendChild(
        nonEuropean
    );
    }

    const name =
    document.createElement('strong');

    name.className =
    'identity-result-name';

    name.textContent =
    identity.name;

    nameArea.appendChild(
        name
    );

    const codeArea =
    document.createElement('div');

    codeArea.className =
    'identity-code-area';

    const codeOptions =
    getIdentityCodeOptions(
        identity
    );

    const visibleCodeOptions =
    codeOptions
    .slice()
    .sort(
        (a, b) =>
        a.code.split('-').length -
        b.code.split('-').length
    );

    const displayedCodeOptions =
    visibleCodeOptions
    .slice(
        0,
        2
    )
    .reverse();

    for (
        const option
        of displayedCodeOptions
    ) {
        const codeLabel =
        document.createElement('span');

        codeLabel.className =
        'identity-code';

        codeLabel.textContent =
        option.code;

        codeArea.appendChild(
            codeLabel
        );
    }

    if (
        codeOptions.length > 2
    ) {
        const moreLabel =
        document.createElement('span');

        moreLabel.className =
        'identity-code';

        moreLabel.textContent =
        '[...]';

    codeArea.appendChild(
        moreLabel
    );
    }

    header.appendChild(
        nameArea
    );

    header.appendChild(
        codeArea
    );

    result.appendChild(
        header
    );

    const matchingAliases =
    aliases.filter(
        alias =>
        alias
        .toLocaleLowerCase()
        .includes(query)
    );

    const identityNameMatches =
    identity.name
    .toLocaleLowerCase()
    .includes(query);

    const identityCodeMatches =
    identity.code
    .toLocaleLowerCase()
    .includes(query);

    const aliasesToDisplay =
    matchingAliases.length &&
    !identityNameMatches &&
    !identityCodeMatches
    ? matchingAliases
    : aliases;

    if (
        aliasesToDisplay.length
    ) {
        const aliasLine =
        document.createElement('div');

        aliasLine.className =
        identity.code.startsWith('@')
        ? 'identity-category-aliases'
        : 'identity-aliases';


        if (
            identity.code.startsWith('@')
        ) {
            const bestAlias =
            aliasesToDisplay
            .slice()
            .sort(
                (a, b) =>
                textRelevance(
                    a,
                    query
                ) -
                textRelevance(
                    b,
                    query
                )
            )[0];


            if (bestAlias) {
                aliasLine.textContent =
                `"${bestAlias}" is included in this category.`;
            }
        }

        else {
            aliasLine.textContent =
            `Also known as ${aliasesToDisplay.join(' and ')}`;
        }

        result.appendChild(
            aliasLine
        );
    }

    const allRelationships =
    getInheritedRelationships(identity);


    const relationships =
    sortIdentityRelationships(
        allRelationships,
        query
    );

    if (
        relationships.length
    ) {
        const relations =
        document.createElement('div');

        relations.className =
        'identity-relations';

        for (
            const relation
            of relationships
        ) {
            const relationCode =
            getRelationshipIdentityCode(
                relation
            );

            if (!relationCode) {
                continue;
            }

            const related =
            HaericodeOntology.get(
                relationCode
            );

            const tag =
            document.createElement('span');

                const isMatchingBroaderIdentity =
                isBroaderIdentityRelationship(
                    relation
                ) &&
                relationshipMatchesQuery(
                    relation,
                    query
                );


                if (
                    isMatchingBroaderIdentity
                ) {
                    tag.className =
                    'identity-relation-tag identity-broader-tag';
                }

                else {
                    tag.className =
                    'identity-relation-tag';
                }

                if (
                    relationshipMatchesQuery(
                        relation,
                        query
                    )
                ) {
                    tag.classList.add(
                        'identity-relation-match'
                    );
                }

                tag.textContent =
                relationLabel(
                    relation
                );

                relations.appendChild(
                    tag
                );
            }


            if (
                relations.children.length
            ) {
                result.appendChild(
                    relations
                );
            }
    }

    result.addEventListener(
        'click',
        () => {
            showIdentityCodePopup(
                identity
            );
        }
    );

    return result;
}

// SEARCH RENDERING

function renderIdentitySearch() {
    const query =
    identitySearch.value
    .trim()
    .toLocaleLowerCase();

    identityResults.innerHTML = '';

    if (!query) {
        closeIdentitySearch();

        return;
    }

    let matches =
    findIdentityMatches(
        query
    );

    const nonEuropeanMatches =
    matches
    .filter(
        match =>
        match.identity.code.startsWith('@')
    )
    .map(
        match => ({
            match,
            score:
            getNonEuropeanMatchScore(
                match.identity,
                query
            )
        })
    )
    .filter(
        entry =>
        entry.score < 999
    )
    .sort(
        (a, b) =>
        a.score -
        b.score
    );

    matches =
    matches.filter(
        match =>
        !match.identity.code.startsWith('@')
    );

    if (
        nonEuropeanMatches.length
    ) {
        matches.push(
            nonEuropeanMatches[0].match
        );
    }

    sortIdentityMatches(
        matches,
        query
    );

    if (!matches.length) {
        const empty =
        document.createElement('div');

        empty.className =
        'identity-search-empty';

        empty.textContent =
        'No identities found. Try a name, code, alias, or classification.';

        identityResults.appendChild(
            empty
        );

        openIdentitySearch();

        return;
    }

    matches.forEach(
        (match, index) => {
            identityResults.appendChild(
                createIdentityResult(
                    match.identity,
                    query,
                    index === 0
                )
            );
        }
    );

    openIdentitySearch();
}

// SEARCH EVENTS

identitySearch.addEventListener(
    'input',
    renderIdentitySearch
);

identitySearch.addEventListener(
    'focus',
    () => {
        if (
            identitySearch.value.trim()
        ) {
            renderIdentitySearch();
        }
    }
);

identityBackdrop.addEventListener(
    'click',
    () => {
        closeIdentitySearch();
    }
);

// GENERAL HELPERS

function humanIdentityName(code, fallback = code) {
    const identity =
    HaericodeOntology.get(code);

    return identity
    ? identity.name
    : fallback;
}

function formatPercentage(value) {
    if (
        Number.isInteger(value)
    ) {
        return `${value}%`;
    }

    return `${Number(value.toFixed(2))}%`;
}

function createHumanOutputLine(
    percentage,
    name,
    note = ''
) {
    const line =
    document.createElement('div');

    line.className =
    'human-output-line';

    const percentageElement =
    document.createElement('strong');

    percentageElement.className =
    'human-output-percentage';

    percentageElement.textContent =
    formatPercentage(percentage);

    const nameElement =
    document.createElement('span');

    nameElement.className =
    'human-output-name';

    nameElement.textContent =
    name;

    line.appendChild(
        percentageElement
    );

    line.appendChild(
        nameElement
    );

    if (note) {
        const noteElement =
        document.createElement('span');

        noteElement.className =
        'human-output-note';

    noteElement.textContent =
    `(${note})`;

    line.appendChild(
        noteElement
    );
    }

    document.getElementById('jsonOutput').open = false;

    return line;
}

// COMPOSITION IDENTITIES
function getCompositionRelationships(
    entry
) {
    return Array.isArray(
        entry.relationships
    )
    ? entry.relationships
    : [];
}

function collectBroaderIdentities(
    entry
) {
    const result = [];

    function walk(
        relationships,
        visited = new Set()
    ) {
        if (!Array.isArray(relationships)) {
            return;
        }

        for (
            const relation
            of relationships
        ) {
            if (
                !isBroaderIdentityRelationship(
                    relation
                )
            ) {
                continue;
            }

            const identityCode =
            getRelationshipIdentityCode(
                relation
            );

            if (!identityCode) {
                continue;
            }

            if (
                visited.has(identityCode)
            ) {
                continue;
            }

            const broader = {
                code: identityCode,
                name:
                relation.name ||
                humanIdentityName(
                    identityCode
                )
            };

            result.push(
                broader
            );

            const nextVisited =
            new Set(visited);

            nextVisited.add(
                identityCode
            );

            walk(
                relation.relationships,
                 nextVisited
            );
        }
    }

    walk(
        getCompositionRelationships(
            entry
        )
    );

    return result;
}

function addPercentage(
    map,
    code,
    name,
    percentage
) {
    if (!code) {
        return;
    }

    if (!map.has(code)) {
        map.set(
            code,
            {
                code,
                name,
                percentage: 0,
                included: []
            }
        );
    }

    map.get(code).percentage +=
    Number(percentage) || 0;
}

function buildIdentityTotals(
    composition
) {
    const totals =
    new Map();


    for (
        const entry
        of composition
    ) {
        const code =
        entry.identity;

        const name =
        entry.name ||
        humanIdentityName(code);

        const percentage =
        Number(entry.percentage) || 0;


        const broaderRelationships =
        collectBroaderIdentities(
            entry
        );

        if (
            broaderRelationships.length
        ) {
            continue;
        }

        addPercentage(
            totals,
            code,
            name,
            percentage
        );
    }

    return totals;
}

function addBroaderIdentityTotals(
    totals,
    composition
) {
    for (
        const entry
        of composition
    ) {
        const percentage =
        Number(entry.percentage) || 0;

        const broader =
        collectBroaderIdentities(
            entry
        );

        if (
            !broader.length
        ) {
            continue;
        }

        const highestBroader =
        broader[
            broader.length - 1
        ];

        addPercentage(
            totals,
            highestBroader.code,
            highestBroader.name,
            percentage
        );

        const parentTotal =
        totals.get(
            highestBroader.code
        );

        const immediateBroader =
        broader.length >= 2
        ? broader[
            broader.length - 2
        ]
        : null;

        const includedName =
        immediateBroader
        ? immediateBroader.name
        : (
            entry.name ||
            humanIdentityName(
                entry.identity
            )
        );

        if (
            includedName &&
            includedName !==
            highestBroader.name &&
            !parentTotal.included.some(
                item =>
                item.code ===
                (
                    immediateBroader
                    ? immediateBroader.code
                    : entry.identity
                )
            )
        ) {
            parentTotal.included.push({
                code:
                immediateBroader
                ? immediateBroader.code
                : entry.identity,

                name:
                includedName
            });
        }
    }
}

// CLASSIFICATIONS

function collectClassifications(
    relationships,
    result = new Map(),
                                visited = new Set()
) {
    if (!Array.isArray(relationships)) {
        return result;
    }

    for (
        const relation
        of relationships
    ) {
        const relationCode =
        relation.identity;

        if (!relationCode) {
            continue;
        }

        const visitKey =
        `${relation.type}:${relationCode}`;

        if (
            visited.has(visitKey)
        ) {
            continue;
        }

        const nextVisited =
        new Set(visited);

        nextVisited.add(
            visitKey
        );

        if (
            relation.type ===
            'classification'
        ) {
            if (!result.has(relationCode)) {
                result.set(
                    relationCode,
                    {
                        code: relationCode,
                        name:
                        relation.name ||
                        humanIdentityName(
                            relationCode
                        ),
                        percentage: 0
                    }
                );
            }
        }

        collectClassifications(
            relation.relationships,
            result,
            nextVisited
        );
    }

    return result;
}

function buildClassificationTotals(
    composition
) {
    const totals =
    new Map();

    for (
        const entry
        of composition
    ) {
        const percentage =
        Number(entry.percentage) || 0;

        const classifications =
        collectClassifications(
            entry.relationships
        );

        for (
            const classification
            of classifications.values()
        ) {
            if (
                !totals.has(
                    classification.code
                )
            ) {
                totals.set(
                    classification.code,
                    {
                        ...classification
                    }
                );
            }

            totals.get(
                classification.code
            ).percentage +=
            percentage;
        }
    }

    const nonEuropeanPercentage = composition
    .filter(entry => String(entry.identity || '').startsWith('@'))
    .reduce((sum, entry) => sum + (entry.percentage || 0), 0);

    if (!totals.has('EU*')) {
        totals.set('EU*', {
            code: 'EU*',
            name: 'European',
            percentage: 100 - nonEuropeanPercentage
        });
    }

    return totals;
}

// METADATA

function getMetadataName(metadata) {
    if (!metadata) {
        return;
    }

    return (
        metadata.name ||
        metadata.identity ||
        metadata.code
    );
}

function renderMetadata(
    metadata,
    container
) {
    if (
        !Array.isArray(metadata) ||
        !metadata.length
    ) {
        return;
    }

    const groups = new Map();

    for (const item of metadata) {
        if (
            !item ||
            typeof item !== 'object'
        ) {
            continue;
        }

        const type = String(
            item.type || 'Metadata'
        ).trim();

        const name = getMetadataName(item);

        if (!name) {
            continue;
        }

        const code =
        item.identity ||
        item.code ||
        name;

        if (!groups.has(type)) {
            groups.set(
                type,
                {
                    items: [],
                    shown: new Set()
                }
            );
        }

        const group = groups.get(type);

        if (group.shown.has(code)) {
            continue;
        }

        group.shown.add(code);
        group.items.push(name);
    }

    for (const [type, group] of groups) {
        if (!group.items.length) {
            continue;
        }

        const line =
        document.createElement('div');

        line.className =
        'human-output-metadata';

            const label =
            document.createElement('strong');

            label.textContent =
            `${type} Identity: `;

            const value =
            document.createElement('span');

            value.textContent =
            group.items.join(', ');

            line.appendChild(label);
            line.appendChild(value);
            container.appendChild(line);
    }
}

// FINAL HUMAN OUTPUT

function renderHumanOutput(
    json
) {
    humanOutput.innerHTML = '';

    if (!json) {
        humanOutputCard.style.display =
        'none';

        return;
    }

    const composition =
    json.mode === 'parentage'
    ? json.derivedComposition
    : json.composition;

    if (
        !Array.isArray(composition)
    ) {
        humanOutputCard.style.display =
        'none';

        return;
    }

    humanOutputCard.style.display =
    '';

    const identityTotals =
    buildIdentityTotals(
        composition
    );

    addBroaderIdentityTotals(
        identityTotals,
        composition
    );

    const classificationTotals =
    buildClassificationTotals(
        composition
    );

    const identitySection =
    document.createElement('div');

    identitySection.className =
    'human-output-group';

        const identityHeading =
        document.createElement('h3');

        identityHeading.textContent =
        'Identities';

        identitySection.appendChild(
            identityHeading
        );


        const identityEntries =
        [...identityTotals.values()]
        .sort(
            (a, b) =>
            b.percentage -
            a.percentage
        );


        for (
            const entry
            of identityEntries
        ) {
            const note =
            entry.included.length
            ? `includes ${entry.included
                .map(
                    child =>
                    child.name
                )
                .join(', ')}`
                : '';

                identitySection.appendChild(
                    createHumanOutputLine(
                        entry.percentage,
                        entry.name,
                        note
                    )
                );
        }


        humanOutput.appendChild(
            identitySection
        );

        if (
            classificationTotals.size
        ) {
            const classificationSection =
            document.createElement('div');

            classificationSection.className =
            'human-output-group';

                const classificationHeading =
                document.createElement('h3');

                classificationHeading.textContent =
                'Classifications';

                classificationSection.appendChild(
                    classificationHeading
                );

                const classifications =
                [...classificationTotals.values()]
                .sort(
                    (a, b) =>
                    b.percentage -
                    a.percentage
                );

                for (
                    const entry
                    of classifications
                ) {
                    classificationSection.appendChild(
                        createHumanOutputLine(
                            entry.percentage,
                            entry.name
                        )
                    );
                }

                humanOutput.appendChild(
                    classificationSection
                );
        }

        // Metadata section

        const metadataSection =
        document.createElement('div');

        metadataSection.className =
        'human-output-group';

                renderMetadata(
                    json.metadata,
                    metadataSection
                );

                if (
                    metadataSection.children.length
                ) {
                    humanOutput.appendChild(
                        metadataSection
                    );
                }
}

// RANDOM SIDEBAR IMAGES
const photo = document.querySelector("#photo");

if (photo) {
    const imageDirectory = "webpage/images/";

    const images = ["jake-mullins-5nW0FVAqJko-unsplash.avif", "julia-solonina-Csja8O0sbOw-unsplash.avif", "lacyec-YiQ6oHfJP_Q-unsplash.avif", "filippo-I-nTYEA2fVk-unsplash.avif", "kevin-aebischer-ehOYfabfMM8-unsplash.avif", "julia-solonina-kfGtkvNBdCY-unsplash.avif", "jimmy-woo-Uwy366qEHxc-unsplash.avif", "just-jus-ShVkVOuz3gY-unsplash.avif", "thomas-bormans-YKpddXEYsPM-unsplash.avif", "gloria-cretu-iek_zWEB0Fw-unsplash.avif", "dana-andreea-gheorghe-bsLP35_JDe8-unsplash.avif", "adrian-botica-GD2FxhKCbbI-unsplash.avif", "lukas-souza-gwusFp6lGZs-unsplash.avif", "joshua-kettle-aw-ENtJQziI-unsplash.avif", "gleb-lucky-f8jG-BF9m5w-unsplash.avif", "jad-limcaco-DenHSkScL0Y-unsplash.avif", "t-lkHuKeqUu3o-unsplash.avif", "leonhard-niederwimmer-gLsRblJize8-unsplash.avif", "victor-malyushev-WVrrQgjH6y4-unsplash.avif", "yoav-aziz-pBcwkiPpKms-unsplash.avif", "tomasz-zielonka-7r8JLWDtZgQ-unsplash.avif", "duminda-perera-NQhj8-fEO5A-unsplash.avif", "amir-arsalan-shamsabadi-jgi_wLvCPZQ-unsplash.avif", "pietro-dona-HLeNiaMyDzs-unsplash.avif", "ikechukwu-julius-ugwu-P6VEm9Fq-eM-unsplash.avif", "al-elmes-5f28EWOpIis-unsplash.avif", "chris-boland-7xpcQutV2Ow-unsplash.avif", "fabrizio-coco-vJVgpHVGUxw-unsplash.avif", "chen-YgjXFEqyZhY-unsplash.avif", "sergey-konstantinov-2sPx_siLbi4-unsplash.avif", "Equestrian_Statue_of_Leopold_II_by_Thomas_Vin\u00e7otte.avif", "rickie-tom-schunemann-prcx8NxJPr4-unsplash.avif", "claudio-schwarz-KE6E30tiYx4-unsplash.avif", "tobias-reich-d5kyG0AkorQ-unsplash.avif", "richard-gabriel-moritz-zf7NmQNLMhk-unsplash.avif", "nir-himi-ATNGlWANd5w-unsplash.avif", "nikola-kojevic-VYZW2EadaLs-unsplash.avif", "tom-athawes-qQpOmK4YbSc-unsplash.avif", "chris-barbalis-eTEQjB44fXU-unsplash.avif", "st-basils-cathedral-and-minin-and-pozharsky-monument-in-moscow.avif", "thomas-chizzali-eDF075Ot1po-unsplash.avif", "fiona-murray-degraaff-UHiyIbFc7Vo-unsplash.avif", "dario-mueller-3Lx7oCekC0I-unsplash.avif", "carlo-romero-aAXGe96JT_4-unsplash.avif", "julian-rayar-mE82XhKIVXE-unsplash.avif", "peter-steiner-1973-HHbhv4hMAVg-unsplash.avif", "eddie-zhang-lCT7ty9Wfac-unsplash.avif", "k-mitch-hodge-4qSLPmgilrw-unsplash.avif", "nishesh-jaiswal-dtNh_sRASKw-unsplash.avif", "najib-chari-uDB-H537MbU-unsplash.avif", "francesca-grima-ln_slYqaMiI-unsplash.avif", "alfred-morsing-hcmW5VA-j-o-unsplash.avif", "lennon-cheng-MjZTRdQOH5o-unsplash.avif", "andries-meijer-bIt-GmvZH-Q-unsplash.avif", "sam-tsonis-US-SQOjBmB4-unsplash.avif", "matterhorn-mountain-peak-with-traditional-swiss-chalets-in-autumn.avif", "pablo-velasquez-qwzlyFCHrLA-unsplash.avif", "marie-bellando-mitjans-MK-wSQhbp8s-unsplash.avif", "king-s-church-international-cI03akxWLus-unsplash.avif", "chris-curry-qVVRtdGbUwA-unsplash.avif", "Frederiksborg-Castle-14-3333095123.avif", "martin-luther-statue-in-front-of-frauenkirche-dresden.avif", "roshan-chakkeeri-WpW88k8nFbU-unsplash.avif", "close-up-of-roman-emperor-statue-with-laurel-wreath.avif", "ivan-alleksy-YvNTP2EvTms-unsplash.avif", "gothic-stone-statue-of-madonna-and-child-on-cathedral-facade.avif", "ornate-golden-knight-armor-with-intricate-patterns.avif", "tomas-malik-BIJtfV2oyd8-unsplash.avif", "joel-de-vriend-1ImxmZf_2qc-unsplash.avif", "riccardo-bernucci--8I6PHinY_4-unsplash.avif", "alex-quezada-7Nmyk01TZ_k-unsplash.avif", "micheile-henderson-T9M7McL2c2Q-unsplash.avif", "samuel-quek-KsKh77nSHBY-unsplash.avif", "church-steeple-rising-above-autumn-trees-on-a-path.avif", "nathan-lilly-eBotF5Y99t0-unsplash.avif", "vered-caspi-I3Ecfht6vlg-unsplash.avif", "sarah-nikiforoff-yCcwt0kiQvw-unsplash.avif", "alba-calbeto-fTVWIXIeUok-unsplash.avif", "kutay-burunsuz-jWxhIrnFljU-unsplash.avif", "engjell-gjepali-x1J0kYAFJE8-unsplash.avif", "julia-solonina-6tOyqOiYKAk-unsplash.avif", "anan-hu-kNG0cS2msw0-unsplash.avif", "parej-richard-Be6dmyWgOHA-unsplash.avif", "adam-bignell-CZTTg1vTpmg-unsplash.avif", "daniel-diesenreither--dG7HU2QY-c-unsplash.avif", "black-icelandic-church-with-white-door-and-steeple.avif", "ben-elliott-uFrs7kObIGc-unsplash.avif", "san-fermin-pamplona-navarra-YNlDe1XTCgQ-unsplash.avif", "leandre-c-WUv0txHkBZY-unsplash.avif", "jacalyn-beales-12ROJ_LlKVo-unsplash.avif", "ronin-NVdZUxgx9cI-unsplash.avif", "fred-clery-hy3LY3TRLCE-unsplash.avif", "armands-brants-CyzwJnG_icA-unsplash.avif", "josip-ivankovic-qzPxcV8sFeE-unsplash.avif", "alexandru-bogdan-6r77QJ9qM_k-unsplash.avif", "keszthelyi-timi-tNQebg0JMl8-unsplash.avif", "sung-jin-cho-2UwdTgztgBc-unsplash.avif", "peter-gunther-8TFDMYDPIfw-unsplash.avif", "felicia-varzari-YVFeBbusJw4-unsplash.avif", "josip-ivankovic-YMmzndx2xFY-unsplash.avif", "rod-long-h14qZmHumqM-unsplash.avif", "nhi-d-fAkT1hmRAYY-unsplash.avif", "julian-rayar-28vif8PfHIw-unsplash.avif", "hostaphoto--GJlx-lqXNg-unsplash.avif", "martti-salmi-14d7McEzjWU-unsplash.avif", "patrick-langwallner-OrVWCGaWgi0-unsplash.avif", "historic-german-windmill-on-cobblestone-path.avif", "bao-menglong-FnNein--0Y8-unsplash.avif", "vladan-raznatovic-c3LwtDKV_sI-unsplash.avif", "josip-ivankovic-vGJXY2yHjA8-unsplash.avif", "viktoriia-kondratiuk-aVC1oWswfy8-unsplash.avif", "filippo-cesarini-FGuuSZBJvQQ-unsplash.avif", "leyre-M7A3GmjZn5M-unsplash.avif", "gabriella-clare-marino-Qw-8CiJxOOA-unsplash.avif", "marco-FcYPNMjXXSs-unsplash.avif", "leonardo-da-vinci-statue-in-florence-architectural-niche.avif", "al-elmes-4VBTm0AVzSU-unsplash.avif", "olga-mandel-IS1RkG6m5eI-unsplash.avif", "bradley-pritchard-jones-Ad-Zb6nS4j8-unsplash.avif", "domenico-loia-AHCQNnCN2LU-unsplash.avif", "nicola-fittipaldi-RSG6sarPXCA-unsplash.avif", "aneta-pawlik-zY36f4ABhik-unsplash.avif", "yakov-savelev-gZZ9voAo_0Q-unsplash.avif", "andreas-brunn-Cv1Ni9CYV1s-unsplash.avif", "stephen-packwood-3V7SagcgIo4-unsplash.avif", "jessica-kantak-bailey-tqM4y3PqJGE-unsplash.avif", "howard-walsh-uM3W3PvI4_k-unsplash.avif", "max-shturma--heWKAdnkvo-unsplash.avif", "stefan-kostic-TqrzsT9OOc8-unsplash.avif", "andreas-rasmussen-YAolnqbMkVE-unsplash.avif", "daria-kolesnyk-o6_mc2AmZJQ-unsplash.avif", "maria-sime-aJZy491Rjns-unsplash.avif", "pooja-sajan-gWMOa3i3QPw-unsplash.avif", "jose-luis-lobera-sNTjkIEnsos-unsplash.avif", "victor-malyushev-QGM7dLXRM-I-unsplash.avif", "brick-castle-tower-with-garden-terrace-in-bruges.avif", "tim-hufner-pQtoIPzbi64-unsplash.avif", "oleksandr-zbanduto-9-Qh-Hs-g8o-unsplash.avif", "louise-krause-y9wD0t9je9E-unsplash.avif", "lukas-janssen-fZr22plKedc-unsplash.avif", "jarrett-I8y-0TRqcPI-unsplash.avif", "julia-solonina-lvDLWAH52vI-unsplash.avif", "filipe-nobre-jv8qpPybiVY-unsplash.avif", "abhishek-singh-VY5VxW1KLkE-unsplash.avif", "isaac-maffeis-ItoCzSfj_zo-unsplash.avif", "micheile-henderson-M3F0aCjhN2w-unsplash.avif", "anna-blake-skQUDAsdnJ8-unsplash.avif", "olivia-pedler-doYSIvkJncg-unsplash.avif", "barnabas-davoti-eNucOoranpo-unsplash.avif", "lukas-s-7Bw0084ifQg-unsplash.avif", "arpad-czapp-DtikQlI8dww-unsplash.avif", "luise-and-nic-JrDpllqd5H8-unsplash.avif", "amada-ma-0rfOfwKqOCs-unsplash.avif", "razvan-mirel-uCPje6dq7RQ-unsplash.avif", "karol-stryny-2j5fHm49UvI-unsplash.avif", "aldo-loya-mlItaXQdVsw-unsplash.avif", "deniz-demirci-DRJ_c3m0BlE-unsplash.avif", "riffat-muntaz-HNVwrNQ3vBI-unsplash.avif", "david-svihovec-wvoisxQTsqw-unsplash.avif", "kasper-rasmussen-wHLU_XmKZII-unsplash.avif", "gilles-boutault-7-kEh25MgM4-unsplash.avif", "jimmy-hu-KaRU4_keOGw-unsplash.avif", "kouji-tsuru-aM2IW7jqjys-unsplash.avif", "adrien-delforge-DG0cRc4ADo4-unsplash.avif", "simon-kessler-kaso_wvh9wg-unsplash.avif", "mika-baumeister-6q7sOFomXs8-unsplash.avif", "grand-cathedral-interior-with-mosaic-and-dome.avif", "vienna_building_austria_garden_park_roses-636817.avif", "marek-piwnicki-M_zlOd_9UU4-unsplash.avif", "lara-vincere-8ErlULU0igM-unsplash.avif", "dmitry-limonov-_knnk_aueXg-unsplash.avif", "mana5280-btAXypy6664-unsplash.avif", "rupin-kale-SWEpPrVopqQ-unsplash.avif", "meina-yin-cA5DlZymjrk-unsplash.avif", "ze-paulo-DunFoH99ask-unsplash.avif", "keszthelyi-timi-ezUDjYy17EA-unsplash.avif", "josip-ivankovic-YLO7Ydi2nXg-unsplash.avif", "rose-galloway-green-cIxCl4WsXdg-unsplash.avif", "victor-malyushev-LL3tl9Ae68w-unsplash.avif", "hert-niks-2YboUxb7K7E-unsplash.avif", "gabriel-kraus-0N53WZgnn4o-unsplash.avif", "equestrian-statue-of-king-charles-iii-in-madrid-plaza.avif", "lovro-pavlicic-WZwwVBltFIc-unsplash.avif", "lara-schipperen-bEFlh8CWYuE-unsplash.avif", "low-angle-view-of-notre-dame-cathedral-facade-in-paris.avif", "kristaps-solims-m91b1igd9Tc-unsplash.avif", "marcel-strauss-scRAqYkxxqw-unsplash.avif", "drew-dempsey-aBKKqOsZf1w-unsplash.avif", "serge-le-strat-oADX_ZHXjlo-unsplash.avif", "darius-LQQ1l07BPRc-unsplash.avif", "eduardo-drapier-NSoEZzGDZGg-unsplash.avif", "ricardo-cortez-qAd3c7N0Gjk-unsplash.avif", "abdullah-ali-5vaW6fC-TnE-unsplash.avif", "gabriel-miklos-FP6nZnB90mE-unsplash.avif", "florian-rebmann-eWc6p5PIQbY-unsplash.avif", "parsa-mahmoudi-Z77LGMxQKF0-unsplash.avif", "kaja-reichardt-SssVa1K6Iyg-unsplash.avif", "white-marble-pieta-sculpture-against-blue-sky.avif", "jerome-prax-tmVztYzff9o-unsplash.avif", "nagarjun-kogaravalli-sathyanarayana-5MC-ltl4LZg-unsplash.avif", "anenelie-u-wpK6KJmDDd4-unsplash.avif", "javier-balseiro-kKqZXR0IGNs-unsplash.avif", "martti-salmi-ddAKgVtHBN4-unsplash.avif", "c-gom-MG9ukanxzv0-unsplash.avif", "k-mitch-hodge-uvHDp-XplPI-unsplash.avif", "gabriel-castles-WSK8iL_ngUw-unsplash.avif", "elliot-gouy-EN26i--FiiM-unsplash.avif", "dp-loxx-fp5DA-Ansmo-unsplash.avif", "joao-U6frB18_tQU-unsplash.avif", "rasmus-smedstrup-mortensen-C3dPhBAZNUY-unsplash.avif", "gondolas-passing-under-the-bridge-of-sighs-in-venice.avif", "ayad-hendy-PDD4nQaj6ig-unsplash.avif", "lukas-souza--FVemYXsoDw-unsplash.avif", "satvik-tqvNjKUfYl0-unsplash.avif", "graddes-5A-ymNQRp4M-unsplash.avif", "chris-boland-1P_bekBuyPY-unsplash.avif", "defne-kucukmustafa-nud2Qpfo6lM-unsplash.avif", "beth-k-dY-pMIISLQo-unsplash.avif", "gabriella-clare-marino-RQjZnwWXfLc-unsplash.avif", "nicolas-j-leclercq-MK3r7Biqxvo-unsplash.avif", "frenjamin-benklin-0J02SuXZdlE-unsplash.avif", "luca-j-qMlaTAUgRAA-unsplash.avif", "henry-ren-YN5USP2srrE-unsplash.avif", "denis-FzQkcs8osW0-unsplash.avif", "david-martinez-torres-zjoK-rEw5uk-unsplash.avif", "andreas-weilguny-dvNhfTLVWYs-unsplash.avif", "ahmet-yuksek-kTT5ZqJvenM-unsplash.avif", "wolfgang-vrede-nJufULyskss-unsplash.avif", "historic-green-copper-water-tower-in-hamburg-against-blue-sky.avif", "wendy-petricioli-UDDA5bk2s7s-unsplash.avif", "mossy-waterfall-cascading-down-a-rocky-cliff-in-autumn.avif", "anna-hunko-2RnIXzDkdKs-unsplash.avif", "dmitry-limonov-ozTki2Gw-M8-unsplash.avif", "eduard-delputte-sEsS48-Fpj0-unsplash.avif", "weronika-romanowska-rqyVAxLFUCo-unsplash.avif", "ludovic-delot-7gmZV3Uc5UQ-unsplash.avif", "yoshihiro-A7rDb00eIrA-unsplash.avif", "soham-banerjee-1voOKDdrELo-unsplash.avif", "janice-liao-tprdpTaHfCo-unsplash.avif", "eugene-chystiakov-Qj_mxwgnw-Y-unsplash.avif", "anna-k-iAPXbM_SQRg-unsplash.avif", "nazrin-babashova-U24jG6F70NM-unsplash.avif", "robert-visual-diary-H_o7d_pem1U-unsplash.avif", "sunlit-gothic-cloister-arches-and-stone-pillars.avif", "lisa-fecker-bJbc2ydUWOc-unsplash.avif", "arlind-photography-SX1M22damac-unsplash.avif", "nir-himi-g618DJRhjvo-unsplash.avif", "luca-dugaro-QnTI48M3Leo-unsplash.avif", "patrick-federi-_Q6L7n1-tiA-unsplash.avif", "jimmy-woo-RS9Cq3alGek-unsplash.avif", "historic-half-timbered-street-in-colmar-alsace-france.avif", "deniz-demirci-gkyDN2nJb9A-unsplash.avif", "ping-hua-chen-Li6K0N96aeM-unsplash.avif", "the-shard-tower-rising-above-historic-london-cobblestone-street.avif", "jonathan-borba--0fS1UMmeaI-unsplash.avif", "neil-potter-6htKIoJwpxU-unsplash.avif", "moritz-kindler-km6rzGsQYl4-unsplash.avif", "mazilovart-WDh4kNUymaM-unsplash.avif", "majestic-alpine-waterfall-cascading-down-rocky-cliff.avif", "steffen-lemmerzahl-bFKBkHn4o68-unsplash.avif", "em-aA4wwgn9f5I-unsplash.avif", "dan-loftus-h4zfAmxy8yc-unsplash.avif", "bianca-ackermann-kgen2CN2KX0-unsplash.avif", "low-angle-view-of-bronze-warrior-statue-on-stone-pedestal.avif", "tim-schmidbauer-XIlx47zinm0-unsplash.avif", "julian-ostarek-2NrR-JTg0Ec-unsplash.avif", "jimmy-woo-CVZCIvD_m-Y-unsplash.avif", "ognjen-kevic-3_lokt2Qk6M-unsplash.avif", "jacques-dillies-d8FTb89evNA-unsplash.avif", "yaennckew-xu93WUySM6k-unsplash.avif", "bennart-gunawan-EBlm06ocPqE-unsplash.avif", "gabriel-miklos-miqAqe_WUtc-unsplash.avif", "michael-hamments-B7EH13tIHhk-unsplash.avif", "maria-sime-gjAg_nosLD4-unsplash.avif", "imran-hecimovic-wNJVaOH6dCs-unsplash.avif", "jerry-mccreary-ZoVEMO7cgI0-unsplash.avif", "justin-wei-J38pjTGnMEw-unsplash.avif", "peter-wu-IDsLDCWxIB4-unsplash.avif", "bastien-nvs-qeCIkbwBXWg-unsplash.avif", "ancient-stone-castle-ruins-with-tower-against-blue-sky.avif", "daniel-becker-xdrx-HRifLk-unsplash.avif", "steffen-petermann-T9jqzy0INbA-unsplash.avif", "yoshihiro-VDgr1wGzBL4-unsplash.avif", "dustin-bowdige-PB5_cv_2TU0-unsplash.avif", "etienne-assenheimer-YvjZeoPV0V4-unsplash.avif", "willie-woodard-qfoQeXPgE9E-unsplash.avif", "santeri-danraB30w34-unsplash.avif", "marco-de-gregorio-7MpUE1Y1C58-unsplash.avif", "juan-domenech-jCNPu5leq8s-unsplash.avif", "eduardo-drapier-mSGqyUrgnfk-unsplash.avif", "alexandre-valdivia-i8MNwsdhPeo-unsplash.avif", "david-edkins-9-38WfxpTx8-unsplash.avif", "bellinzona2.avif", "pascal-metzger-HZVQMx1A9T0-unsplash.avif", "austin-p-dWPj9-vt-FY-unsplash.avif", "liosha-shyp-rZFeKqKThv0-unsplash.avif", "grand-hall-of-natural-history-museum-with-dinosaur-skeletons.avif", "faezeh-taheri-Hne6drySGfQ-unsplash.avif", "jahanzeb-ahsan-CovC_cg_QhA-unsplash.avif", "june-o-kpSUcn5xayw-unsplash.avif", "Statue_of_Cecil_John_Rhodes_at_UCT_(5829551829).avif", "martin-katler-HChME7lVsi4-unsplash.avif", "stephanie-leblanc-u-FIrRAuVhk-unsplash.avif", "jenna-brenner-zm0xw-UF5Bg-unsplash.avif", "usman-nasir-6mtBTSuQXdU-unsplash.avif", "helena-lila-nchLH0Zt6MU-unsplash.avif", "chris-curry-1gkKaEQ1KnM-unsplash.avif", "rodrigo-rodrigues-wolf-r-t-0VsYp7NsvVs-unsplash.avif", "massimiliano-morosinotto-YKqJ1ejmX5E-unsplash.avif", "igor-dernovoy-mUBRl_pRjDk-unsplash.avif", "david-vives-SyGJslQp83A-unsplash.avif", "silvan-schuppisser-GsBwIl2beCQ-unsplash.avif", "ziyao-xiong-J_luJEZinok-unsplash.avif", "baptiste-buisson-USb7hPozCx0-unsplash.avif", "keszthelyi-timi-UoOYKHreuO8-unsplash.avif", "bronze-statue-of-henry-the-lion-holding-sword-and-castle.avif", "mountain-alps-italy-flowers-preview.avif", "low-angle-view-of-equestrian-statue-framed-by-circular-brick-architecture.avif", "marcus-ganahl-f8pIyiBXMtc-unsplash.avif", "yuliya-yevseyeva-jWlRUrq1noQ-unsplash.avif", "micah-kunkle-ck4YXK7_k_k-unsplash.avif", "maria-baranova-NR9VDvOsXxQ-unsplash.avif", "sander-lenaerts-6gScjC67nzg-unsplash.avif", "marcel-strauss-597kO-tGak4-unsplash.avif", "anna-ansone-ZUr1lnY1HVs-unsplash.avif", "j-weisner-zRRHGUZsEKg-unsplash.avif", "timothy-cohen-acbVWFg0YLA-unsplash.avif", "mr-xerty-NYZICf_kPIA-unsplash.avif", "euronewsweek-media-cyavGrEl3oM-unsplash.avif", "kamilla-isalieva-6rW4ifkx56A-unsplash.avif", "colomban-y7fVMwgYFNE-unsplash.avif", "victor-malyushev-3SFE-MzyVRU-unsplash.avif", "yana-marudova-jaA6nsXF1KU-unsplash.avif", "yoooo-app-CBh8UFEWvHg-unsplash.avif", "rico-reutimann-XxAR3uzYiZY-unsplash.avif", "classical-marble-sculptures-on-grand-architectural-facade.avif", "itay-peer-Gh18GuLMe5M-unsplash.avif", "narbeh-arakil-V6oMDKo81cI-unsplash.avif", "damiano-baschiera-KtlBp_YttlY-unsplash.avif", "jakub-tomasik-vL-ZQwOMFcw-unsplash.avif", "nacho-gimeno-guerrero-7Larf3ORGy4-unsplash.avif", "maria-lupan-Q4cGTkmK37A-unsplash.avif", "renaldo-kodra-hhEPRU1soFg-unsplash.avif", "murilo-silva-JdnN5QcbHe8-unsplash.avif", "anastassia-anufrieva-Lm7c-0yemo8-unsplash.avif", "samuel-quek-YtScd2lv7Qg-unsplash.avif", "silviya-nenova-03NOkuzTAt4-unsplash.avif", "harm-van-de-ven-Cx5HGn9qlas-unsplash.avif", "dusan-veverkolog-tRi3JJkvT80-unsplash.avif", "julia-solonina-utViXRpCE9s-unsplash.avif", "sebastien-goldberg-vgGjc_jHyfU-unsplash.avif", "amir-arsalan-shamsabadi-urYPsc868-Q-unsplash.avif", "valentin-lacoste-D4K5iRyadkI-unsplash.avif", "adrian-botica-Fcp9ITJCjGE-unsplash.avif", "grigorii-shcheglov-jvhxbfU5_80-unsplash.avif", "agata-ciosek-RoY-zcF61f4-unsplash.avif", "matthew-ye-dt17rpJWy6s-unsplash.avif", "marina-reich-iwVzmgzdYfo-unsplash.avif", "soumyadip-jana-8hgAPRTFQCk-unsplash.avif", "asatru-procession.avif", "henrique-ferreira-hUvMmHT_p54-unsplash.avif", "jens-peter-olesen-BmhszN5FeWM-unsplash.avif", "david-salamanca-xCjkghRpsMI-unsplash.avif", "alexander-k00ntyEE62g-unsplash.avif", "eduard-delputte-DMQPpKIKdHU-unsplash.avif", "ben-wicks-0DmqMJloWmI-unsplash.avif", "bobby-mSpYhvZ12qo-unsplash.avif", "nella-n-L0WwGer-Jso-unsplash.avif", "guillaume-didelet-vvmdfat6gPc-unsplash.avif", "zhenyu-luo-wQT-djhrvQM-unsplash.avif", "ben-elliott-VcGBzFZ3Xwg-unsplash.avif", "j-znBKxS5_eQA-unsplash.avif", "00920140_2-768x1024.avif", "simon-vollformat-quu_fgK3Xfo-unsplash.avif", "joris-van-der-zalm-0YgvNZb4-Iw-unsplash.avif", "lone-white-building-nestled-in-rugged-mountain-landscape-at-dusk.avif", "chloe-martin-oTv4ZThUvqU-unsplash.avif", "katelyn-g-uOqKJmF4S6g-unsplash.avif", "jil-beckmann-s1Pu3-S9l70-unsplash.avif", "remi-boyer-lp8VQhDoJXM-unsplash.avif", "shoham-avisrur-8KpzpDPjqPU-unsplash.avif", "whitby-abbey-ruins-and-graveyard-under-stormy-sky.avif", "eric-bouchet-MRwkjgM2XgI-unsplash.avif", "claus-grunstaudl-qt4sH60mR1k-unsplash.avif", "phu-tri-do-g2rJVWy0Imw-unsplash.avif", "andy-wang-pt9QxiKUnmw-unsplash.avif", "david-becker-KFAUjBqjFCg-unsplash.avif", "jessica-kantak-bailey-JsiARYLnobc-unsplash.avif", "filiz-elaerts-gks495790kk-unsplash.avif", "victoria-prymak-KwSAMA7BC0E-unsplash.avif", "stephanie-leblanc-fA9LOHIF1-c-unsplash.avif", "safe-republic-AXychVzHsCs-unsplash.avif", "ozgur-yilmaz-_sum_Zz4Htw-unsplash.avif", "don-b-lG7bqP0giXs-unsplash.avif", "kevin-charit-pAAs8Zs24v8-unsplash.avif", "adam-bignell-P684lvtmBlY-unsplash.avif", "jonny-gios-r_YKyWTWKHQ-unsplash.avif", "illiya-vjestica-XVTaFz8dk1M-unsplash.avif", "leonhard-niederwimmer--5VMPwRciX0-unsplash.avif", "celine-chamiot-poncet-3L9jruTcxDw-unsplash.avif", "abdullah-ali-j8ATyJpKn3I-unsplash.avif", "leonard-cotte-U1EqiOO-msI-unsplash.avif", "herr-bohn-458e_cprbHE-unsplash.avif", "winding-road-through-snowy-mountain-valley-with-river.avif", "ijaz-rafi-ooht8MH1dr4-unsplash.avif", "alexandra-zelena-1bpaJVNnBx4-unsplash.avif", "hugo-carle-Bb9nbFrHdrw-unsplash.avif", "andrew-spencer-VxV-EK-Vi5k-unsplash.avif", "anna-k-qrg2vhG9L1E-unsplash.avif", "marko-kelecevic-ta2vZHhAC8E-unsplash.avif", "paul-bill-zDd0A27pWBo-unsplash.avif", "matthieu--KgqgNgHhqc-unsplash.avif", "drew-dempsey-4FHTEtaj9TM-unsplash.avif", "leonhard-niederwimmer-SlYyOtxWQ_8-unsplash.avif", "ricardo-gomez-angel-uBKVUU_KLGg-unsplash.avif", "federico-di-dio-photography-LwVWKVd_jQA-unsplash.avif", "robert-bahn-NfUH9JAHFCk-unsplash.avif", "alek-burley-2cgH4o0TpRQ-unsplash.avif", "taneli-lahtinen-NAHRvimeWHs-unsplash.avif", "chris-johnson-TXZUbmcKxCg-unsplash.avif", "claudio-schwarz-mlDnqslsdKQ-unsplash.avif", "spencer-davis-ckotRXopwRM-unsplash.avif", "jonathan-borba-g9Uy7CCb-GE-unsplash.avif", "julie-gaia-guzal-Lz-9RPVEh94-unsplash.avif", "artur-matosyan-PHg6HAqXFCI-unsplash.avif", "bronze-statue-of-ambiorix-celtic-warrior-king.avif", "patrick-federi-m8yLJto0HJE-unsplash.avif", "yoav-aziz-13jqPjlPwwE-unsplash.avif", "eduard-delputte-wYXoQ4yIIbw-unsplash.avif", "tim-bernhard-NuTA4TMkSZ4-unsplash.avif", "K\u00f6nigsberg_Castle.avif", "al-elmes-yZAjIcXxpR0-unsplash.avif", "jean-carlo-emer-jmL3z5emYjg-unsplash.avif", "david-becker-Hx7DI1uPCIM-unsplash.avif", "yearone-N_BFHuxWyeQ-unsplash.avif", "oksana-8hoWnphJRqY-unsplash.avif", "arpad-czapp-CKQKYrQ9RWw-unsplash.avif", "simon-hermans-5v387KYQX_4-unsplash.avif", "gilles-seguin-r337UjZJaik-unsplash.avif", "obed-hernandez-9Os_Y8RZdqk-unsplash.avif", "doga-erdem-k3RwoZFqnW8-unsplash.avif", "martine-mussies-RrCMAJ7-XLc-unsplash.avif", "kwan-fung-sV9Q0QVaqYc-unsplash.avif", "yogendra-negi-RrPNFk0puqA-unsplash.avif", "nao-xotl-jJ5ec5Ke_bo-unsplash.avif", "jimmy-woo-lmrEmPC7Ty8-unsplash.avif", "robin-ulrich-Xd8AaJK61Ak-unsplash.avif", "mai-sakura-3qIgiJ-6auA-unsplash.avif", "joel-nevius-1TxmxxOgfDA-unsplash.avif", "justitia-statue-holding-sword-and-scales-against-sky.avif", "bronze-statue-of-saint-agnes-of-bohemia-in-prague.avif", "annie-spratt-0gYT9WNN-3Q-unsplash.avif", "tejas-kotha-DaEvqQAOVmM-unsplash.avif", "alison-pang-S6H0q3qJkqU-unsplash.avif", "julia-solonina-261AAoos5GE-unsplash.avif", "sarah-donovan-0_pwxJP0KUI-unsplash.avif", "clay-banks-B6I4kHyYQLs-unsplash.avif", "tommao-wang-LbVARToYEDA-unsplash.avif", "ticia-vesztergombi-HXkzTE8l0G4-unsplash.avif", "harm-van-de-ven-fa8eqoDQT4w-unsplash.avif", "vazgen-Gy0bCH1l-C0-unsplash.avif", "rhayane-daibert-zZqhUYjaB3A-unsplash.avif", "partha-narasimhan-QJqkrPtLAuE-unsplash.avif", "dovlet-hojayev-iBmO2U-UCnM-unsplash.avif", "ricardo-frantz-07-l46POtjg-unsplash.avif", "benoit-deschasaux-zhLgGY6dHgA-unsplash.avif", "santorini-windmills-at-dusk-with-white-cycladic-architecture.avif", "leonhard-niederwimmer-n7qUk_56Frg-unsplash.avif", "andrea-orsini-LLWHujjp4X0-unsplash.avif", "jason-mavrommatis-3FBkaivIeAw-unsplash.avif", "filip-luchianenco-lEtg3A6Ni1w-unsplash.avif", "benjamin-wedemeyer-l-BPJHKGjsk-unsplash.avif", "cam-stockdale-au5vFQ6s5K8-unsplash.avif", "k-mitch-hodge-nnWG3Uulye4-unsplash.avif", "valentyn-giroutx-TibD4LB5gTY-unsplash.avif", "juan-gomez-BsZ-IDx1YD4-unsplash.avif", "stotzer-balazs-d6lFFPiQKRg-unsplash.avif", "jonny-gios-_Ekm17luVMw-unsplash.avif", "stefano-bucciarelli-Fl6qSPe6nqw-unsplash.avif", "s-ratanak-Td-XqY8xexs-unsplash.avif", "trevi-fountain-fontana-di-trevi-rome-preview.avif", "majestic-waterfall-cascading-down-a-steep-cliff-into-a-fjord.avif", "emilie-christensen-q80es5R1lNo-unsplash.avif", "zhu-yunxiao-E2SDNtyTob4-unsplash.avif", "razvan-mirel-z_2TXeHer6I-unsplash.avif", "maxime-galliot-DpLripM1cSE-unsplash.avif", "tommao-wang-SoGGHVWasSI-unsplash.avif", "denise-leisner-BvA6IWcyfV0-unsplash.avif", "jeffrey-zhang-6_leu6AnMM8-unsplash.avif", "pourya-gohari-o9PO6FyAZU0-unsplash.avif", "jimmy-hu-B9T2uXRsv9Y-unsplash.avif", "bastien-nvs-tvgQKmG56Ig-unsplash.avif", "isabela-martin-8sknm6PUvug-unsplash.avif", "david-fucsku-e6Wt57OrkbM-unsplash.avif", "saba-DRe_tIr5riw-unsplash.avif", "barnabas-davoti-MUEIQnZbNso-unsplash.avif", "danielle-suijkerbuijk-eK9b2HzNFxw-unsplash.avif", "julia-taubitz-71U-dam3mpk-unsplash.avif", "bastien-nvs-dJGyhRiVMAY-unsplash.avif", "bronze-statue-of-monulphus-and-gondulphus-in-maastricht.avif", "beth-chobanova-XAljPVlKzic-unsplash.avif", "marcus-ganahl-yXal2Hz7S0A-unsplash.avif", "nikola-kojevic-GuYVH4BWBaM-unsplash.avif", "farin-sadiq-1cBKPzouqrQ-unsplash.avif", "mathias-reding-lIt-0pQMcvo-unsplash.avif", "chris-et4QEJGX11g-unsplash.avif", "florian-peeters-VtgYUjBbmmk-unsplash.avif", "maria-lupan-sXC_jmGiLqw-unsplash.avif", "julia-taubitz-v3bS9pJOWsQ-unsplash.avif", "abdullah-ali-AAg1WH1EyCE-unsplash.avif", "golden-dome-of-les-invalides-cathedral-in-paris.avif", "nikola-johnny-mirkovic-mcP6IGthm1I-unsplash.avif", "mathias-reding-zMwIKTcRNUg-unsplash.avif", "hulki-okan-tabak-36CSlRJ8KgU-unsplash.avif", "khamkeo-rBRZLPVLQg0-unsplash.avif", "michele-bitetto-fuCnlhyjh2I-unsplash.avif", "faith-crabtree-bZzfZa5OZdw-unsplash.avif", "philipp-neumann-uMhTnV81AGo-unsplash.avif", "rita-chou-i6TxKf38y88-unsplash.avif", "mark-stuckey-HY4A6yrEOC4-unsplash.avif", "winged-lion-of-saint-mark-statue-in-venice.avif", "DoornikLuchtfoto.avif", "christopher-politano-U2_By5ZPEFg-unsplash.avif", "john-morgan-GqlDs7qRFuM-unsplash.avif", "kate-banar-bkJD-k9jxR4-unsplash.avif", "bryan-urk-IA9rT69Vjmc-unsplash.avif", "job-savelsberg-un4-mNxMyhw-unsplash.avif", "leonhard-peters-HnTbh-Cbqzc-unsplash.avif", "yearone-muAIoiRKGcE-unsplash.avif", "tom-podmore-f5VjyPNK9O4-unsplash.avif", "alexander-kaufmann-oBsbUzu0pmg-unsplash.avif", "cheuk-wai-lee---YVINLNr5E-unsplash.avif", "anton-kotlovskii-F3j7neUTmqQ-unsplash.avif", "shavonne-yu-4_XtDLaOfNA-unsplash.avif", "patrick-metzdorf-xyQnsGRmeNQ-unsplash.avif", "artsemi-simanenkau-kkbgNod62ug-unsplash.avif", "wolfgang-weiser-oUT3Y-cSjjQ-unsplash.avif", "alessandro-stech-JIBYUHTvQhs-unsplash.avif", "historic-stone-bridge-over-canal-in-bruges-belgium.avif", "chris-kursikowski--CdXoxPUilk-unsplash.avif", "anna-hunko-w66RBW4YqdQ-unsplash.avif", "renate-dreyer-LXTXmLDU45c-unsplash.avif", "detait-wLX0mIvgKKo-unsplash.avif", "marjan-van-diepenbeek-TPgn0semsDM-unsplash.avif", "mateusz-baranowski-hDLEmgEM2IY-unsplash.avif", "karli-cumber-LCsKwZDxLi8-unsplash.avif", "kaja-sariwating-KcSnEmBRW-A-unsplash.avif", "martine-mussies-ocVyq7Zzrcg-unsplash.avif", "ornate-renaissance-architecture-of-the-louvre-palace-courtyard.avif", "david-samacoits-etchegoin-khDkMSkvlaY-unsplash.avif", "chris-reyem-GljRXK-tmXw-unsplash.avif", "unma-desai-Fbm5nuxceng-unsplash.avif", "julien-di-majo-ppcrwuhHBOw-unsplash.avif", "dawid-tkocz-o-H5-8g9Jy4-unsplash.avif", "leonhard-niederwimmer-gxpIf7LSOf8-unsplash.avif", "beth-chobanova-WhXD6depVns-unsplash.avif", "armin-djuhic-ohc29QXbS-s-unsplash.avif", "dmitrii-e-k54hnLImZsc-unsplash.avif", "saru-robert-TnybFjEnVEI-unsplash.avif", "jonathan-kemper-MbP4dJKSpXo-unsplash.avif", "marcel-strauss-lxkVhgRhIqA-unsplash.avif", "nick-castelli-w3j6L6UmPN8-unsplash.avif", "inma-mellado-UW7av2Vca3w-unsplash.avif", "palace-of-fine-arts-san-francisco-architecture-reflection.avif", "leonhard-niederwimmer-DI2bhBYOhaY-unsplash.avif", "bronze-statue-of-roman-warrior-with-shield-and-sword.avif", "joshua-kettle-J3aCPmA1adM-unsplash.avif", "elisa-schmidt-v2Kuqr0hRf4-unsplash.avif", "stefano-bernardo-MXRnU2u__60-unsplash.avif", "bao-menglong-wj87zLww_fA-unsplash.avif", "image.avif", "victor-malyushev-xbLqar-Kmlw-unsplash.avif", "sebastian-coman-travel-QnrbmKNgQmQ-unsplash.avif", "maria-rodideal-q9A00i_nbi4-unsplash.avif", "tomi-vadasz-LRcCbZybI-Q-unsplash.avif", "nir-himi-58V98QVcGKk-unsplash.avif", "ancient-stone-church-tower-on-a-hillside-in-spain.avif", "ornate-neo-gothic-crypt-hall-with-stained-glass-and-sunlight.avif", "tapio-haaja-z9LKMs0P3bo-unsplash.avif", "vigouroux-gerald-z1MKLDuIXiQ-unsplash.avif", "martin-katler-RnYt3QZBzxs-unsplash.avif", "anastasiya-d-9cAPlRG4Vuc-unsplash.avif", "sergej-Q_BluvpeA3U-unsplash.avif", "daniel-sessler-Pp2gQxask7E-unsplash.avif", "andrea-de-santis-nXSJBdDwjoU-unsplash.avif", "autumn-tram-tracks-curving-through-a-park-with-yellow-leaves.avif", "yahya-momtaz-WScPy95tPU4-unsplash.avif", "adam-bignell-SUlpHGj__CE-unsplash.avif", "ingrid-martinussen-7KU2oWzHKY0-unsplash.avif", "alin-gavriliuc-qy6-NzhCd6g-unsplash.avif", "maria-sime-Xn9KdD5uriI-unsplash.avif", "gabriel-tovar-e-qx3eF0BQs-unsplash.avif", "lea-IJ6ca_bHi28-unsplash.avif", "lottie-griffiths-NP-r21x6lf4-unsplash.avif", "juan-i-riera-egGIEJTVbqY-unsplash.avif", "philippe-oursel-Oer7jCMqZtk-unsplash.avif", "stone-archway-framing-historic-church-in-cyprus.avif", "jimmy-liu-ZTmw-yrwwAs-unsplash.avif", "clovis-wood-L8RAb5_YVpg-unsplash.avif", "mikolas-voborsky-koz4ODrWwX0-unsplash.avif", "christopher-politano-F2nBOVmwcHs-unsplash.avif", "peyman-shojaei-p3atTjsTk7Y-unsplash.avif", "jahanzeb-ahsan-5u__PO9hXvA-unsplash.avif", "sanket-gupta-oIljHp5lTVY-unsplash.avif", "clay-banks-IsVKA1BOaro-unsplash.avif", "manu-ntlutrwFXvg-unsplash.avif", "nader-saremi-o2OF_ikor-U-unsplash.avif", "david-hertle--l2SmXmqiVI-unsplash.avif", "lucas-derksen-BR5ngZwzTWs-unsplash.avif", "marcus-ganahl-lQH17eZC7S8-unsplash.avif", "ot-design-ar8yVb_H7fg-unsplash.avif", "kumas_taverne-jGgtYNKoa6I-unsplash.avif", "anna-church-iCSKf3Yc6YY-unsplash.avif", "mavroudis-papas-h_xybRJpv_c-unsplash.avif", "daniel-sessler--PcrXRjoP-A-unsplash.avif", "evelin-v-4PX2MarakTQ-unsplash.avif", "reggie-b-Wr-bNLmbtx0-unsplash.avif", "sudev-pradhan-_x39XKIXQj4-unsplash.avif", "bronze-statue-of-warrior-on-horseback-fighting-lion.avif", "grigorii-shcheglov-0jVJOf4cDqI-unsplash.avif", "justin-buchholz-2e2qFaTJHpo-unsplash.avif", "felix-mittermeier-nRBG3J0EDQQ-unsplash.avif", "low-angle-view-of-michelangelos-david-statue-in-florence.avif", "bogdan-nanescu-Ah03G_dbf7k-unsplash.avif", "anna-hunko-exEquyH4YeY-unsplash.avif", "hoai-nam-mai-9S7PtdC4UsY-unsplash.avif", "martti-salmi-ul0JkaZXjro-unsplash.avif", "timothy-cohen-o2y6EawlVYI-unsplash.avif", "hulki-okan-tabak-dRtIfDKSBZA-unsplash.avif", "sami-ullah-KHg0Z4AygIo-unsplash.avif", "jakob-h_-XSOVl9KHa-g-unsplash.avif", "ondrej-barta-BtTxAJBt9P8-unsplash.avif", "piotr-RKmMIr63kTE-unsplash.avif", "mark-de-jong-bC6zWYXneCI-unsplash.avif", "florian-van-duyn--ZktwJWN_24-unsplash.avif", "nathalia-arantes-X10VE0OfYfU-unsplash.avif", "giuseppe-mondi-Qq1fwSLM0N0-unsplash.avif", "hannah-falk-jvZFi5Tni9c-unsplash.avif", "josip-ivankovic-9S99hWHCQNw-unsplash.avif", "vishnu-prasad-PBjLm1ASJ7k-unsplash.avif", "ilia-afsharpoor-BDKLjwwudWQ-unsplash.avif", "ilia-afsharpoor-8IjaiPX_zac-unsplash.avif", "paddy-rodden-GGsXP17Qp8U-unsplash.avif", "gudrun-sigurjonsdottir-jz-shbIEYNg-unsplash.avif", "darko-m-omnG4tz5GeY-unsplash.avif", "Frederiksborg-Castle-16-3647386926.avif", "greta-t-t2l-1ybVHXs-unsplash.avif", "vladimir-vinogradov-f6vt7Nx9saM-unsplash.avif", "alex-azabache-QSHizbKavt8-unsplash.avif", "max-van-den-oetelaar-nrxhkaK_uxs-unsplash.avif", "daniels-joffe-wgZZ9h-VoCw-unsplash.avif", "quique-olivar-5NYAjL-j9gM-unsplash.avif", "henry-mollers-6XprSaXZZEo-unsplash.avif", "artur-matosyan-olpvyRuuUxo-unsplash.avif", "eduard-delputte-lbJ_tNl9Ees-unsplash.avif", "neven-krcmarek-6gVdwi7qzAo-unsplash.avif", "eddie-zhang-anPHD3DbmCI-unsplash.avif", "clovis-wood-1aSni0iNoLs-unsplash.avif", "david-bottenberg-v-Ooz2LtBX0-unsplash.avif", "marcel-r-8soI6OrkAZM-unsplash.avif", "samuel-isaacs-pNPhJ5b_kfA-unsplash.avif", "richard-hedrick-OpfsdRGHOHQ-unsplash.avif", "sydney-russakov-XU_MYbgspMI-unsplash.avif", "shannia-christanty-3dmJrTVGu4M-unsplash.avif", "mario-beqollari-wsqdr_AY0Yg-unsplash.avif", "gerard-griffay-9dhpO52u-tg-unsplash.avif", "maria-ivanova-tRdAryBc_fc-unsplash.avif", "daniil-korbut-XvBcudKb-jo-unsplash.avif", "cristiano-pinto-ZigUhnPuczs-unsplash.avif", "selina-bubendorfer-fmTS4rJ0HMg-unsplash.avif", "greta-farnedi-DWZaTfhfZ_s-unsplash.avif", "justizia_vienna_austria_parliament_pillar_statue-1335098.avif", "thijs-scheper-JLTGtCT8bj8-unsplash.avif", "medieval-castle-on-cliff-edge-with-stone-bridge.avif", "marcus-ganahl-OJFpLNx2u0w-unsplash.avif", "marcus-ganahl-f58UQKyTZC4-unsplash.avif", "paul-schnurle-qbEHNEE9hw4-unsplash.avif", "joshua-kettle-6oWJHNmgs5I-unsplash.avif", "jahanzeb-ahsan-VHpuiFh0Cc4-unsplash.avif", "roman-vasylovskyi-aE-uVyFAYiQ-unsplash.avif", "fabe-collage-1MRs70sfcuE-unsplash.avif", "bryan-brittos-DsTl0Ly4Uc4-unsplash.avif", "orelien-fly-dh34UjV58qI-unsplash.avif", "william-IM_GX4Eyckc-unsplash.avif", "patrick-stadler-puSvDdTgJ9o-unsplash.avif", "wolfgang-weiser-xPqzlWYigIg-unsplash.avif", "julian-wallner-mLHTp9bWswk-unsplash.avif", "kelly-quilodran-QkBujk87pa8-unsplash.avif", "joshua-kettle-r4Yb3zRhw_Q-unsplash.avif", "cedric-raddoux-q-6DHH2jP30-unsplash.avif", "clovis-wood-H-zlGRk4Psw-unsplash.avif", "daria-glakteeva-Ex4aa2TnsMc-unsplash.avif", "aleksandr-zaitsev-am_vGpI73M4-unsplash.avif", "mr-bochelly-lqgJkQkYva4-unsplash.avif", "elly-ch-PHcb_LuLMC4-unsplash.avif", "gordon-williams-9rj2-Pfthd8-unsplash.avif", "chalo-gallardo-Q0zVAOghz2I-unsplash.avif", "daniele-tofani-Cv0x2GDrJf4-unsplash.avif", "reegan-fraser-bAFYnQ0H4H0-unsplash.avif", "sebastian-puskeiler-kOFTeDU-nEc-unsplash.avif", "jackson-barger-cDRc8J0cmrk-unsplash.avif", "filippo-molinari-x601hffYMjE-unsplash.avif", "willian-justen-de-vasconcellos-vQ-Lyt-OEeg-unsplash.avif", "parsa-mahmoudi-nfi-TXXzwjI-unsplash.avif", "jahanzeb-ahsan-2japeikE-UA-unsplash.avif", "ray-harrington-ZacBgK8SJd8-unsplash.avif", "vagelis-karathanasis-c3jLg6ejrhQ-unsplash.avif", "katrina-eglite-F__Vgdrjons-unsplash.avif", "hakan-sundblad-KYvZsRaY86M-unsplash.avif", "alicia-abeloos-TtA_vuaRczE-unsplash.avif", "historic-italian-monastery-courtyard-with-stone-arches-and-bell-tower.avif", "jimmy-hu-yeuGJ7sT2Kw-unsplash.avif", "andreas-brunn-Cw3To2Te3Xk-unsplash.avif", "linus-fritz-ClQETLs2Sfk-unsplash.avif", "noel-broda-kVTHy2ZYjsw-unsplash.avif", "lucas-FeEO4ZfB2TM-unsplash.avif", "alessandro-cavestro-WymO0-LI1mc-unsplash.avif", "iulia-buta-ZeqBnEd7KiM-unsplash.avif", "artur-matosyan-c_Z4lyZXGsA-unsplash.avif", "wolfgang-weiser-GmwEXiLCNgk-unsplash.avif", "chris-jones-s7p6kvz_vYI-unsplash.avif", "abbie-newton-wZ8S9pXiih0-unsplash.avif", "bram-bergers-QXWFE1-_swc-unsplash.avif", "anne-nygard-A6CKAsYguQM-unsplash.avif", "francesco-zivoli-2dRaaOgVe9U-unsplash.avif", "filipe-nobre-C23wtD5hTho-unsplash.avif", "denis-UUwkefUbXxo-unsplash.avif", "derek-sutton-nd2zdeOCYFQ-unsplash.avif", "tomasz-zielonka-P-EwcU7Uw2k-unsplash.avif", "scheyern-basilica-with-red-roses-and-lavender-garden.avif", "geert-hansma-hK1yDVZfeBQ-unsplash.avif", "cameron-gibson-EF5DUILM7eY-unsplash.avif", "kira-laktionov-2cB1Cl9UJLY-unsplash.avif", "francesco-zivoli-CmvMcW19SmQ-unsplash.avif", "chris-jones-8pQGsoUoTDg-unsplash.avif", "julia-solonina-UAd_yYS3Q2s-unsplash.avif", "nomadic-julien-uE5yQeWrmdQ-unsplash.avif", "filipp-romanovski-LmgdcZOldEs-unsplash.avif", "alexander-b3A-tXn0P44-unsplash.avif", "nathaniel-shuman-cbO8Q8s3C00-unsplash.avif", "keszthelyi-timi-1biQ86WUrKI-unsplash.avif", "mat-ktdpYIi0ajA-unsplash.avif", "georg-eiermann-iDV_jy_oEI4-unsplash.avif", "aron-marinelli-QraHMxHYb7k-unsplash.avif", "christian-regg-FNaFLvbLFuk-unsplash.avif", "andrew-krasilnikov-nr33Ui18POE-unsplash.avif", "dan-loftus-AJnKOBFk6oI-unsplash.avif", "rolands-varsbergs-ePOH0oKeOjE-unsplash.avif", "pascal-bullan-3To1oVEt01g-unsplash.avif", "alexander-lydDrkJPAcM-unsplash.avif", "mark-de-rooij-TX0tJAtCFZ4-unsplash.avif", "zach-plank-2hq6jMnUK0g-unsplash.avif", "bryan-dijkhuizen-LbwVALb3zuA-unsplash.avif", "joshua-kettle-fO2DTakYhfk-unsplash.avif", "mikita-yo-01kcX-0H7g0-unsplash.avif", "diogo-nunes-mPxJJXTWmEE-unsplash.avif", "andrew-krasilnikov-AGPfMfOSM60-unsplash.avif", "julia-solonina-teGUtvdTiQ8-unsplash.avif", "clara-pfister-M-KD0KcZYBE-unsplash.avif", "alfred-leung-o_eU39LleJ0-unsplash.avif", "sascha-bosshard-3N1qBL6Jjug-unsplash.avif", "remy-gieling-h0Z-R1DAd7g-unsplash.avif", "adrian-botica-0LL1TwKP_kM-unsplash.avif", "aleksandra-kovacic-fe_y1OCFs18-unsplash.avif", "zhiyuan-sun-miOIealwEFc-unsplash.avif", "valentino-mazzariello-RW1w_DYao_Q-unsplash.avif", "bridge-garden-wisteria-river-preview.avif", "harrison-mitchell-XzFdGiiK8TQ-unsplash.avif", "andrew-slifkin-Ye1Aw2cBBBI-unsplash.avif", "eric-hong-Ka8xLwYVY4E-unsplash.avif", "who-s-denilo-aU9eXkfVxqw-unsplash.avif", "dieter-k-0Z9KLLXhoG8-unsplash.avif", "ian-mackey-GE_o1AD8vvs-unsplash.avif", "max-zed-xLgENq9t8OM-unsplash.avif", "matteo-gozzi-O6XMTQUwHbs-unsplash.avif", "aurora-song-NY263dhSaYE-unsplash.avif", "jose-de-la-paz-naranjo-zFNx4AW8at8-unsplash.avif", "white-marble-angel-statue-against-blue-sky.avif", "tim-meyer-SZ4KZrPIKuQ-unsplash.avif", "daniel-sessler-ckcEoPdIcIY-unsplash.avif", "masood-aslami-nQM5EOT7kLI-unsplash.avif", "samuel-regan-asante-BiRKUNX8bU0-unsplash.avif", "ilia-bronskiy-1FYxFwSiKkk-unsplash.avif", "anna-storsul-4homfWXFuJA-unsplash.avif", "toksot-hsbYBhm2Z2k-unsplash.avif", "valentin-lacoste-JWPTawG6xGA-unsplash.avif", "christian-krebel-zViK-rmZuu0-unsplash.avif", "low-angle-view-of-hercules-fighting-snake-bronze-statue-in-louvre-museum.avif", "ian-kelsall-XYrnCH0vRSI-unsplash.avif", "daniel-j-schwarz-X3pHGg4xXSE-unsplash.avif", "despina-galani-7ovd4eNzAOE-unsplash.avif", "daniele-colucci-rUspBEXbrc0-unsplash.avif", "edgar-pimenta-8wZbmGE2eU0-unsplash.avif", "mateo-krossler-R2Aimp3Y7J4-unsplash.avif", "geoff-oliver-DlRkOYc1zy4-unsplash.avif", "t-s2nBl5yFSLA-unsplash.avif", "treesan-OQ7CF8EKybE-unsplash.avif", "bare-tree-by-rhine-river-with-basel-skyline.avif", "annie-spratt-48IUK0ehEiw-unsplash.avif", "laurynas-zizys-aCHUm_hk4o0-unsplash.avif", "victor-malyushev-z3JI5xJEXDk-unsplash.avif", "adam-vradenburg-g8DI2ZZFt8I-unsplash.avif", "ciro-magliano-7_vrHPbp9mU-unsplash.avif", "raymond-petrik-jGYgjxZpkPQ-unsplash.avif", "graddes-MRJ7e-WLG-M-unsplash.avif", "cab-8kHizwvoFQw-unsplash.avif", "rayyan-8pFnggQdFfY-unsplash.avif", "ridesh-bisht-_YLdljZ-7jk-unsplash.avif", "nir-himi--yywY7UQ5Ek-unsplash.avif", "pille-r-priske-v0ItDmv2Xsg-unsplash.avif", "jimmy-woo-DFt659uY2-I-unsplash.avif", "bergdorf-ticino-alpine-stone-house.avif", "tom-podmore-qCSv7XMHy5I-unsplash.avif", "quentin-S0C5XuraVoo-unsplash.avif", "merve-sehirli-nasir-kkuBi1eL9AY-unsplash.avif", "cande-westh-DG61k_CDtOU-unsplash.avif", "saile-ilyas-WnibRPxqF3A-unsplash.avif", "snap-wander-uQ3jKHjnPHs-unsplash.avif", "flo-p-hQWe_xXHnbg-unsplash.avif", "barney-goodman-oNu1kP8QzLI-unsplash.avif", "lizixi-zhu-NkLu0vy1ycM-unsplash.avif", "ethan-wilkinson-4smvEhZJSQo-unsplash.avif", "kristaps-grundsteins-0hvIxgaZIhs-unsplash.avif", "michael-martinelli-8ASjZyGdoGs-unsplash.avif", "hohenneuffen-castle-with-three-spires-and-red-roof.avif", "george-bale-le13DTm6qk8-unsplash.avif", "sarah-5JR2NoInU9U-unsplash.avif", "pamela-hallam-bC3SFHKTBfY-unsplash.avif", "adrian-mag-vV2TOyiT9HY-unsplash.avif", "kevin-mueller-vKSA_b8JBE0-unsplash.avif", "low-angle-view-of-classical-stone-columns-and-architecture.avif", "filiz-elaerts-eMwg4GAbBXA-unsplash.avif", "rufinochka-IGXXKvJ4bZc-unsplash.avif", "basil-minhaj-GpGC71VwlkI-unsplash.avif", "seri-C24MUnUykY0-unsplash.avif", "florian-rebmann-8cVgUSpMhNU-unsplash.avif", "large-tree-with-autumn-leaves-on-a-grassy-trail-in-lessinia-italy.avif", "matteo-cathelin-vI6F91kFGSc-unsplash.avif", "filippo-biasiolo-Em9KeKs_6O4-unsplash.avif", "nadine-redlich-ZmoOLjKYhxo-unsplash.avif", "eleonora-altomare-lMlhYD3Tktg-unsplash.avif", "al-elmes-R_2ixB-TR2k-unsplash.avif", "adam-mechedal-Ixv6JOLsiJE-unsplash.avif", "clement-proust-ovpADMQy6Yk-unsplash.avif", "zane-lee-0ZGAFrPV_MI-unsplash.avif", "noah-GYnP-Go9KXc-unsplash.avif", "ian-cylkowski-AASZMUquB2U-unsplash.avif", "weathered-stone-statue-of-woman-in-garden.avif", "jae-park-Vabd0eaLbBA-unsplash.avif", "goethanum.avif", "c-gom-hwvUu-4K4dA-unsplash.avif", "nicolas-gras-ANZudh6KOwk-unsplash.avif", "ariel-burdan-IP_ai6FpGo8-unsplash.avif", "leonhard-niederwimmer-czCvnnUqv18-unsplash.avif", "manuel-fWEr6BZLenE-unsplash.avif", "tobias-reich-nv8q1ft13CE-unsplash.avif", "winston-tjia-wZVTi0sHvww-unsplash.avif", "shawn-2jhsoDt8QN4-unsplash.avif", "michelle-williams-yQzgiYcXVQA-unsplash.avif", "hannes-kottner-GG8kGfBd9Us-unsplash.avif", "yoksel-zok-v8R70A2GeTY-unsplash.avif", "jahanzeb-ahsan-t45Ke62vteg-unsplash.avif", "marvin-langer-LfZac_Kxr7Y-unsplash.avif", "dirk-goncalves-martins-Rsz1rx9HjEQ-unsplash.avif", "marvin-langer-DbOQMWF8S90-unsplash.avif", "folco-masi-LDkF43iNp3I-unsplash.avif", "martti-salmi-vqcsN5Aq3T8-unsplash.avif", "giulia-grani-aThke2Itxyo-unsplash.avif", "matt-eberle-28HtqITLi58-unsplash.avif", "winston-tjia-WbjE1V3qWxg-unsplash.avif", "julia-solonina-5NnK3nJ44g8-unsplash.avif", "k-mitch-hodge-6EmrpF49lvU-unsplash.avif", "stephanie-leblanc-WlckqHo1nL4-unsplash.avif", "niels-neef-wnfjJpr-at4-unsplash.avif", "nicolas-mejia-X5f9FdiLEKI-unsplash.avif", "jordy-munoz-MYj3D_iC1uc-unsplash.avif", "alin-gavriliuc-Ik5p6kHco5I-unsplash.avif", "juan-antonio-guzman-BeXthCT5tug-unsplash.avif", "alissa-schilling-og82Vm9omwU-unsplash.avif", "british-museum-great-court-interior-with-glass-roof-and-visitors.avif", "adam-bignell-v6PZJP0aNik-unsplash.avif", "michael-martinelli-VXVK8_O1Eqk-unsplash.avif", "patrick-pahlke-rhNyal1djkY-unsplash.avif", "khaled-ali-j20BDkCE9FU-unsplash.avif", "evan-buchholz-0hLJE2x78F0-unsplash.avif", "stefano-tanasi-0hTtfX51wO8-unsplash.avif", "jure-tufekcic--Kjx2cBMP6M-unsplash.avif", "carole-hachet-zEMe9yYT8_M-unsplash.avif", "mauricio-munoz-P8ZVfbk3-wc-unsplash.avif", "ruben-hanssen-Oc9UJqyYzpo-unsplash.avif", "monument-aux-morts-archway-with-ocean-view.avif", "roy-tsong-HP9BU1jrZCQ-unsplash.avif", "peter-burdon-YSoXELR396c-unsplash.avif", "faezeh-taheri-94yOpCLyF7E-unsplash.avif", "arie-driessen-lG-yUIOVEVo-unsplash.avif", "xavier-souty-3fhb6GkZnCU-unsplash.avif", "ricardo-gomez-angel-TF-OaX0vw2w-unsplash.avif", "victor-malyushev-VZ6SBoDU7EU-unsplash.avif", "gamze-teoman-wjKeUb-oguw-unsplash.avif", "diego-allen-ONxTXoZRkEE-unsplash.avif", "olivier-chatel-2plAD0Uege8-unsplash.avif", "marc-rentschler-w8IgA66xqsU-unsplash.avif", "interior-of-st-peters-basilica-dome-and-baldachin.avif", "linus-mimietz-0nJ9BFyP_Bw-unsplash.avif", "carolina-nichitin-xo8pEDmCAyA-unsplash.avif", "anina-fetzer-T4ZHovaYifg-unsplash.avif", "mateusz-butkiewicz-V4NwFSe3-aY-unsplash.avif", "adrian-botica-Nf43e4M_sHU-unsplash.avif", "michal-robak-arm-tMzV2Ms-unsplash.avif", "crispin-jones-qsIxYyzDd6s-unsplash.avif", "taras-terletskyy-y_dlFmCHhMI-unsplash.avif", "jonas-allert-oAKjHUqV0nk-unsplash.avif", "ludovic-delot-cNZEFT32FiQ-unsplash.avif", "neptune-fountain-and-town-hall-tower-in-gda\u0144sk-poland.avif", "caroline-baasch-g2n0i_BGwbI-unsplash.avif", "mikita-yo-3UoOeTmVzlo-unsplash.avif", "chris-curry-l6dvHFL2x28-unsplash.avif", "munir-rani-DNMvqJ_kdCQ-unsplash.avif", "stock-birken-LeJ2h4mzEEY-unsplash.avif", "nadine-marfurt-3RrMvY2SkMw-unsplash.avif", "vedhas-pathak-t7gkPU8XY-E-unsplash.avif", "stock-birken-CNbkVur6VMc-unsplash.avif", "finn-K1DM20gR624-unsplash.avif", "samuel-regan-asante-o3IERBKR6lU-unsplash.avif", "chris-cooper-j4vFp136uxw-unsplash.avif", "k-mitch-hodge-sD54rAfpdx8-unsplash.avif", "tobias-reich-jycCp4KQ73M-unsplash.avif", "anna-hunko-0njGMaxm-2I-unsplash.avif", "kentaro-komada-6c3oAWvnw4s-unsplash.avif", "menard-dias-yAKvebKUII0-unsplash.avif", "geoffrey-couten-2AHUPytHMps-unsplash.avif", "anatoly-grebenyuk-O0rHM7wFhhQ-unsplash.avif", "simone-daino-jMFwpLZomeM-unsplash.avif", "sergey-leont-ev-iXtzRYWa3sc-unsplash.avif", "statue_museum_island_berlin_museum_island_landmark_monument_culture-800244.avif", "rodrigo-rodrigues-wolf-r-t-M07cum6zxDY-unsplash.avif", "femi-oyekoya-XC1Ufx888Dk-unsplash.avif", "patrick-federi-bxwZkK8UxK0-unsplash.avif", "alberto-zanetti-uUr2l7d9gu4-unsplash.avif", "matej-pribanic-IQJomMg0thA-unsplash.avif", "f-a-grafie-CC9oWvd-9b8-unsplash.avif", "k2-production-XGGSPXsBulk-unsplash.avif", "nate--teI-uW9BuI-unsplash.avif", "antwerp-reveal-ZFVL18iGm84-unsplash.avif", "belem-tower-in-lisbon-portugal-with-wooden-pier.avif", "marina-zvada-5KuYKncSMSI-unsplash.avif", "robert-katzki-cG8EJCbjoOk-unsplash.avif", "quan-you-zhang-04k-6piPOOc-unsplash.avif", "jerry-kavan-tnpQsR96Rr4-unsplash.avif", "jahanzeb-ahsan-akiPSKVm1ts-unsplash.avif", "nk-ni-aazluSLq-Ac-unsplash.avif", "charly-constant-lBf3g9eZAEM-unsplash.avif", "graddes-xlNXnRLK5RA-unsplash.avif", "nafsika-g-_WzhSxbmWUk-unsplash.avif", "stefzn-GAmRJl_SvoQ-unsplash.avif", "vincenzo-de-simone-oj9MRmW2FSw-unsplash.avif", "shreyashka-maharjan-Ou5sP2o016U-unsplash.avif", "leyre-x5icsOgc7Lw-unsplash.avif", "layla-ait-laaraj-UExF95eI3F4-unsplash.avif", "clovis-wood-PcKKOcYD-G4-unsplash.avif", "martin-bennie-dbvDwR-NV8g-unsplash.avif", "hallstatt_austria_landscape-899944.avif", "katie-kalmykova-LOfIrBOTgE4-unsplash.avif", "gina-aburlacitei-oKbRkGt-UNU-unsplash.avif", "manu-9FBzWmbfvEU-unsplash.avif", "denisa-elena-ficau-fWw2NFvXqYI-unsplash.avif", "heloise-delbos-3YuNLGSOJ2M-unsplash.avif", "jimmy-hu-ubqFOxY5SUY-unsplash.avif", "traditional-swiss-fasnacht-parade-in-basel-old-town.avif", "pierre-goiffon-1CqFMA_VUvw-unsplash.avif", "chrissy-16ukVQEmt4o-unsplash.avif", "chloe-frost-smith-CAEKQsss1bQ-unsplash.avif", "maxime-galliot-miCvc-nClAc-unsplash.avif", "markus-clemens-_YKY-iTO4wk-unsplash.avif", "adrien-olichon-jvfnCO9Soyk-unsplash.avif", "linus-mimietz-yZY5iALvoJQ-unsplash.avif", "mohammed-ashour-rfxZgjKYWSs-unsplash.avif", "woody-van-der-straeten-EAuRzUfRNgc-unsplash.avif", "jan-antonin-kolar-LuBJ1GSvBl4-unsplash.avif", "samuele-giglio-w5-xrQ7ZjdY-unsplash.avif", "shawnn-tan-uNvANKVekXw-unsplash.avif", "tamas-tuzes-katai-o2yfUZU8Tyw-unsplash.avif", "nuki-chikhladze-EQUsR9xc5uk-unsplash.avif", "martti-salmi-1vXSH9aB0ZY-unsplash.avif", "stephen-h-FHEJMfVpqps-unsplash.avif", "wioletta-plonkowska-1UeFIF-eBuY-unsplash.avif", "usman-nasir-JJ3ugw2oXPQ-unsplash.avif", "mika-wegelius-bQXtd9vn2tM-unsplash.avif", "nika-benedictova-qp4i8UPFg38-unsplash.avif", "jonas-da-silva-neq4PglnoRQ-unsplash.avif", "simon-fevery-vYS3ue6obtg-unsplash.avif", "t-DAGnXIOM0Qg-unsplash.avif", "katelyn-g-drtmaF0PN-8-unsplash.avif", "florian-klassen-KGhwl3Q30RY-unsplash.avif", "daniel-j-schwarz-wjnyRVZA9WE-unsplash.avif", "louis-colbee-UBHreK7rZpg-unsplash.avif", "andreas-fischinger-ptyTchkCxYg-unsplash.avif", "ayrton-avid-seq-S88kmLfXywo-unsplash.avif", "evgeni-tcherkasski-C-IBuFE02Mw-unsplash.avif", "bronze-statue-of-jan-kili\u0144ski-in-warsaw.avif", "patrick-keller-WvGHQm-1KwE-unsplash.avif", "zachary-pearson-bQVvOVtUU1U-unsplash.avif", "pierre-goiffon-KYmery2R8jg-unsplash.avif", "danilo-obradovic-Ns10Mjpt8P4-unsplash.avif", "daniel-olah-TbU9iOkSzcs-unsplash.avif", "celine-chamiot-poncet-mDIMJzdu5D0-unsplash.avif", "john-koliogiannis--sI6im4tj9o-unsplash.avif", "pierre-goiffon-ScItuL7YaBY-unsplash.avif", "clay-banks-mgLX9vQhxc8-unsplash.avif", "hongbin-ysonzhjinjw-unsplash.avif", "simon-pallard-OtLQLsry_UM-unsplash.avif", "yevheniia-9YDwpKQi9eo-unsplash.avif", "jf-kaufmann-0xQfvJ73hRM-unsplash.avif", "gabriele-merlino-zTT2COL8eZo-unsplash.avif", "idriss-chair-zHqF0-aTzyw-unsplash.avif", "filippo-taioli-eaNJTiyZWrw-unsplash.avif", "nelson-wong-EaPWK6Jiqxc-unsplash.avif", "k-mitch-hodge-sS--pOKMCh8-unsplash.avif", "lucas-lemoine-YJfS0hJZz7U-unsplash.avif", "liam-mcgarry-tR-f_6zYvIo-unsplash.avif", "william-jones-5nToGQCfaWs-unsplash.avif", "sarah-penney-3pALd7mqItc-unsplash.avif", "vladimir-ivanov-fZmgySdNjoM-unsplash.avif", "tharun-thejus-xGFWzbPZoXc-unsplash.avif", "antonio-sessa-iPKnjf6PrTU-unsplash.avif", "gashif-rheza-a5eSOCkiyzU-unsplash.avif", "vincenzo-de-simone-9efZPKoIOt4-unsplash.avif", "stewart-m-Du9nA1czVGI-unsplash.avif", "free-walking-tour-salzburg-GJArE1LlcuA-unsplash.avif", "victor-malyushev-Ia3v19kNd0o-unsplash.avif", "valery-ryazanoff-ZKSxRqKGwfg-unsplash.avif", "elisa-photography--eTlXDJ-DTs-unsplash.avif", "bastien-nvs-NjOT95xqzs8-unsplash.avif", "rolf-schmidbauer-i5DcVhuzHuE-unsplash.avif", "julia-karnavusha-w5LDNk4EGSU-unsplash.avif", "marcovitjz-P7p-Fpr2hlk-unsplash.avif", "nicolas-weldingh--Fvaz2243kY-unsplash.avif", "t-JCIgl7ySoTc-unsplash.avif", "melissa-de-yoe-oe8DzrFItFY-unsplash.avif", "dick-hoogerdijk-TXoygt4MZXk-unsplash.avif", "morgane-bedel-U7-xQmHZ4B8-unsplash.avif", "rafael-ishkhanyan-TuE_lFoAAWE-unsplash.avif", "damiano-baschiera-yICA8nnNhNs-unsplash.avif", "mayumi-maciel-rjOqHjH9b4Y-unsplash.avif", "matteo-bellia-TSGLCrJ1UuA-unsplash.avif", "benjamin-chambon-Oip3v2paIq0-unsplash.avif", "adrian-botica-_7qP6L6DoUc-unsplash.avif", "konrad-dobosz-GfG-b78a7Jo-unsplash.avif", "baptiste-buisson-rvPlNQHVOlQ-unsplash.avif", "tamar-gogua-B-seqk_tLak-unsplash.avif", "clement-proust-z1GrJPJBRpY-unsplash.avif", "samuel-hagger-W8thnD6Do4E-unsplash.avif", "jimmy-woo-U26lC9wHyL0-unsplash.avif", "razvan-mirel-32yZGZwZCAs-unsplash.avif", "jordan-ZsF1BiJS4Hg-unsplash.avif", "lucy-davis-sMcBUckuWBo-unsplash.avif", "quan-you-zhang-DlpeGJBoCWw-unsplash.avif", "mick-nsenga-MtR9Sc7BjmE-unsplash.avif", "paris-cityscape-with-eiffel-tower-and-avenue.avif", "alin-andersen-3ncacB4Z_8s-unsplash.avif", "damiano-baschiera-PakSLy4jcS0-unsplash.avif", "kaja-sariwating-xzPjUBJvH3U-unsplash.avif", "ernests-vaga-La8vkuRlJRU-unsplash.avif", "chan-lee-hXI42_NrvU0-unsplash.avif", "tim-vh-N56HUQMOZl8-unsplash.avif", "slavan-FsLwdcs7hX8-unsplash.avif", "lukas-d-ss9yY9DpjQk-unsplash.avif", "jacques-dillies-Hzm1Ju23buw-unsplash.avif", "ernst-burki-nNO4WSNgzNk-unsplash.avif", "tim-hufner-NaxqpCYKU-k-unsplash.avif", "daniel-j-schwarz-_8bFE1xZ7T4-unsplash.avif", "rolandas-s-X-kPwIyL7Qw-unsplash.avif", "philipp-b6lhzVyB6sg-unsplash.avif", "plaza-de-espana-seville-spain-architecture-reflection.avif", "tiago-aleixo-tveboMtwZ9c-unsplash.avif", "joao-rafael-chaves-de-araujo-silva-PunJdVaF_lk-unsplash.avif", "ale-PWP4Z94o0eI-unsplash.avif", "conny-schneider-gyYrfmXWZBY-unsplash.avif", "daniel-sessler-1z_KKEuueoo-unsplash.avif", "ben-elliott-dcbQ-M2W0jg-unsplash.avif", "jahanzeb-ahsan-ovVJ6VVqH-s-unsplash.avif", "stone-church-with-red-trim-framed-by-autumn-trees.avif", "szanyi-sandor-h_NYdvLfy7E-unsplash.avif", "guillaume-de-germain-F84YBJGfEdE-unsplash.avif", "sacre-c\u0153ur-basilica-in-paris-with-red-roses-foreground.avif", "ben-sen-hRUndXdqyHM-unsplash.avif", "alex-ndoka-unsG-k9hH4o-unsplash.avif", "vincent-gazeilles-3D09t5dLgQc-unsplash.avif", "kaspars-upmanis-jYW-JmPtbYk-unsplash.avif", "clement-proust-e7w1Odg6nIY-unsplash.avif", "hans-ozkx7Lgm0Pk-unsplash.avif", "mert-kahveci-NtLi8LG_Z9U-unsplash.avif", "thomas-despeyroux-s5FoYqTdsbw-unsplash.avif", "isabelle-truong-lL7kFG5aSoU-unsplash.avif", "historic-white-tower-with-garden-and-blue-sky.avif", "sreekumar-pillai-dD7I0fqr6Ew-unsplash.avif", "hert-niks-yccGbJ5alCg-unsplash.avif", "mathias-reding-ahTkzbNsmL4-unsplash.avif", "philippe-patin-4t2UN7mWwaI-unsplash.avif", "ingrid-martinussen-dZEIEehaDzk-unsplash.avif", "zhu-yunxiao-Uw36fN_D_y4-unsplash.avif", "redcharlie-w6DbzqtP2XY-unsplash.avif", "marcel-strauss-li9E22PUfL4-unsplash.avif", "lizixi-zhu-T0JtBRP_chU-unsplash.avif", "the-forum-rome-archaeological-site-preview.avif", "alex-dudar-65-dNO39DUI-unsplash.avif", "robert-bahn-JoPb-Yxol0k-unsplash.avif", "georgi-kalaydzhiev-97wVIopqxow-unsplash.avif", "sindy-sussengut-UU-HDhUEnzU-unsplash.avif", "oleksandr-xSGur8evk0Y-unsplash.avif", "deny-hill-u1t4ClDHHcE-unsplash.avif", "maria-baranova-Gvabu9HV2f0-unsplash.avif", "illia-panasenko-tfe9E-G4TUw-unsplash.avif", "quan-you-zhang-srDLQV3lcDs-unsplash.avif", "tamas-tuzes-katai-dHSn3lEfFag-unsplash.avif", "tom-bradley-cUMy_phPN8E-unsplash.avif", "basilica-di-santa-maria-della-salute-in-venice-italy.avif", "envi-taraku-ZD3w4dI88cg-unsplash.avif", "moises-gonzalez-GcUl1AdwTTI-unsplash.avif", "jakub-pabis-lKWE1wJbmeA-unsplash.avif", "ilia-bronskiy-NsmhIKZFzGo-unsplash.avif", "lisa-shauma-Rz8L_phRx6I-unsplash.avif", "anna-k-XhwEPZpELr8-unsplash.avif", "sergei-gussev-GHsSqj7DBtI-unsplash.avif", "irena-carpaccio-05Jjd1A3cOE-unsplash.avif", "lorenzo-cerato-GufuqHNyrAs-unsplash.avif", "tim-hufner-U7RAiwAvssY-unsplash.avif", "rachel-schauerman-D7QiUvN5Qvg-unsplash.avif", "barry-talley-q6cWjrOytTQ-unsplash.avif", "anthony-reungere-wBgqxZ5CtYQ-unsplash.avif", "adam-bignell-b9bc0AeXU5Q-unsplash.avif", "jonathan-kemper-bmX-mpT4Q18-unsplash.avif", "mattia-barbieri-gA19018o6zw-unsplash.avif", "eleonora-gaini-U6Kjr4YMAUw-unsplash.avif", "isabella-sp-pqjKnPeSON4-unsplash.avif", "kelly-haskell-nEMDIPV3dA4-unsplash.avif", "matthew-Jv-5rkzyCXk-unsplash.avif", "daniel-sessler-bN6PrYTBCTc-unsplash.avif", "charles-postiaux-FLgZIZArcHg-unsplash.avif", "joachim-lesne-VvIRsP2AD5I-unsplash.avif", "emir-kutluay-PMJWW4Y8wmM-unsplash.avif", "nicole-baster-PXqjkIL6CT8-unsplash.avif", "max-bohme-zZM6x-zQTiQ-unsplash.avif", "nika-benedictova-g7-Z-q2YEAE-unsplash.avif", "shalev-cohen-q5UXgG9m28w-unsplash.avif", "oleksii-rozanov-xN5X7Q4XveU-unsplash.avif", "regos-kornyei-6hooOIK9CAs-unsplash.avif", "andrea-leopardi-a-lN07O_ZNI-unsplash.avif", "ruud-de-peijper-rX7JLNevkvk-unsplash.avif", "neeraj-pramanik-rTmetU4MdvQ-unsplash.avif", "mateo-krossler-IoJfWHdqHCE-unsplash.avif", "julien-di-majo-I-tn-w1gJXk-unsplash.avif", "pille-r-priske-RWP2c-9PX6g-unsplash.avif", "alex-wuKYKJ8twdg-unsplash.avif", "elena-popova-xeFneQTD26A-unsplash.avif", "saint-basils-cathedral-in-moscow-red-square.avif", "maria-sime-pULLYfbWcXA-unsplash.avif", "ryan-klaus-mwpAJAkvB8k-unsplash.avif", "paul-hermann--HUpaTNG8bM-unsplash.avif", "harold-jonker-ycPNQRvJL_Y-unsplash.avif", "edgar-eyu4H5uXTYE-unsplash.avif", "denisa-elena-ficau-BhOTyiciAMA-unsplash.avif", "zihan-huang-rT1f0Dld0KA-unsplash.avif", "k-mitch-hodge-o1DfuCuHuTk-unsplash.avif", "alex-sanzio-SpyW0o4-yfA-unsplash.avif", "remy-penet-lCIKfw6Uxuk-unsplash.avif", "ostrog.avif", "abdullah-habib-D4BAu1xtjw8-unsplash.avif", "millau-viaduct-cable-stayed-bridge-over-green-valley.avif", "michael-starkie-cWGW674kkTg-unsplash.avif", "martin-lea-FJCMKYmg_Qg-unsplash.avif", "abdullah-habib-kszkcoeqgD4-unsplash.avif", "milada-vigerova-U6M6zRr7hA0-unsplash.avif", "chris-reyem-KaUp5Bs0Cv0-unsplash.avif", "damian-kamp-yOL2tfqFHb8-unsplash.avif", "naja-bertolt-jensen-DBfdy4K0Fdc-unsplash.avif", "katelyn-g-2_5EjfaiYbE-unsplash.avif", "marcus-ganahl-zOUkIQJ_Dko-unsplash.avif", "joel-de-vriend-CNQWTHUOOMw-unsplash.avif", "wolfgang-weiser-kYuapeue7zs-unsplash.avif", "richard-hatleskog-h6rn0nJ-Jbk-unsplash.avif", "alex-block-lHgn9WnGyV4-unsplash.avif", "yoanna-yordanova-kLcLdfnS30k-unsplash.avif", "katelyn-g-kCvAr8T0IOE-unsplash.avif", "megan-majocha-AWCFQGAayiY-unsplash.avif", "jah-nomad-8E7H3j7qb04-unsplash.avif", "manou-azadi-XFoOSxqSMkc-unsplash.avif", "marie-m-Iz0ug5G8bmU-unsplash.avif", "marco-d-abramo-SqGStNKm1co-unsplash.avif", "pratik-agrawal-qtDPGSr7yL8-unsplash.avif", "romain-malaunay-SPlRBpc4y58-unsplash.avif", "martino-grua-DsBVjb1rudM-unsplash.avif", "godefroy-le-guisquet-MH4jQ9pGYx8-unsplash.avif", "toa-heftiba-5ukbB_38TBI-unsplash.avif", "robert-schwarz-1LBB7R_SA_U-unsplash.avif", "sterling-lanier--PGlgSaaCsk-unsplash.avif", "wallace-fonseca-QQgsUULJIEI-unsplash.avif", "ash-hayes-t_iM2RG_fZk-unsplash.avif", "florian-rebmann-ZmDagwE1gVc-unsplash.avif", "daniel-sessler-5V8CYkuljyk-unsplash.avif", "zhi-xuan-hew-H3yr77Q_mwg-unsplash.avif", "luke-stackpoole-wTqxHpujKug-unsplash.avif", "michael-descharles-3fcKjlaT8-k-unsplash.avif", "j-weisner-tPuoFeGWxoY-unsplash.avif", "dario-bronnimann-YPAb2xl_S-Q-unsplash.avif", "achim-ruhnau-HYKyIErVMjg-unsplash.avif", "lidija-jakovljevic-k1nVguc4ipU-unsplash.avif", "perspective-nature-pT7Zg368Sks-unsplash.avif", "graddes-k4rz0uAdofU-unsplash.avif", "jacob-cartwright---kJ_2yCBPw-unsplash.avif", "kemal-berkay-dogan-nJlLN24sQLs-unsplash.avif", "cyclist-riding-past-bobolice-castle-in-poland.avif", "maria-sime-29t4IjsmSFg-unsplash.avif", "bjorn-agerbeek-ZKNa-hxz_Lw-unsplash.avif", "bernard-hermant-CPcKMHB1K2A-unsplash.avif", "morten-elsborg-JopJWz0e6to-unsplash.avif", "julia-panasiuk-ZD9ZkkHZ78M-unsplash.avif", "ryan-grice-_QltYFF90WY-unsplash.avif", "lisa-fecker-V-B9sHnqeR4-unsplash.avif", "velodi-tsaguria-qbAVcvpD2TY-unsplash.avif", "roland-fenyes-IooHbXUfOeA-unsplash.avif", "mateo-krossler-FIUSDBws_wI-unsplash.avif", "snowy-mountain-peak-with-clouds-and-pine-forest.avif", "nikita-ti-Cw2bc8OnEu8-unsplash.avif", "arlind-photography-hhOMsp0PzG4-unsplash.avif", "colin-moldenhauer-bHpRTjOsq-s-unsplash.avif", "ilia-bronskiy-OQEbAMjcAWc-unsplash.avif", "francesco-zivoli-B6zEZxWqfPE-unsplash.avif", "thomas-dorgler-BmxnP8oHgPM-unsplash.avif", "duc-nguyen-PMyTNc-JbG4-unsplash.avif", "jarand-k-lokeland-3-MftKobVtg-unsplash.avif", "anthony-3GfJsiXCrME-unsplash.avif", "jamie-wheeler-7B88HXdLucc-unsplash.avif", "rickie-tom-schunemann-A4YE-cOcH58-unsplash.avif", "marek-piwnicki-4Tq_Uz4bUMA-unsplash.avif", "lukas-s-R2lfvZtbCsU-unsplash.avif", "roman-vasylovskyi-aQ-kcbqqCQk-unsplash.avif", "nicolo-salinetti-ogn3lbmxen4-unsplash.avif", "nella-n-lyKiaYWm52A-unsplash.avif", "olzhas-kurikov-rwc033yJY3I-unsplash.avif", "vera-gorbunova-0vdBHqvi6l0-unsplash.avif", "vishnu-prasad-ibHGoGfD1gk-unsplash.avif", "victor-malyushev-zbwLVIEfFGk-unsplash.avif", "tarik-babic-UujrPxuBE4g-unsplash.avif", "victor-malyushev-w_N-XCjiM0o-unsplash.avif", "daniel-j-schwarz-oX95hWDI-wk-unsplash.avif", "oguzhan-tasimaz-2E43RfmqGN4-unsplash.avif", "golden-angel-of-peace-sculpture-on-paris-column.avif", "menglin-yang-7wHmGpj_FQE-unsplash.avif", "stepan-dudycha-0KtIKmrTlUQ-unsplash.avif", "k-mitch-hodge-5vao0H30W50-unsplash.avif", "jimmy-woo-_cbz1K62NqM-unsplash.avif", "eryk-piotr-munk-N9ANH2YOebg-unsplash.avif", "vinay-chavan-JKcDVA2_Mx8-unsplash.avif", "vitaly-mitrofanenko-Gx3N_2yvdZ4-unsplash.avif", "tiphaine-sauveur-m_xxm-o2KxE-unsplash.avif", "le-sixieme-reve-2gjxjF6BjWs-unsplash.avif", "ilnur-kalimullin-CB0Qrf8ib4I-unsplash.avif", "classical-architecture-dome-with-green-copper-angel-statue.avif", "anastasiia-mitiushova-7GnnVREe1wo-unsplash.avif", "swagath-vijayan-JgDPBtmadJU-unsplash.avif", "silver-statue-of-saint-michael-the-archangel-in-gothic-church.avif", "jimmy-woo-yLUD86LNArs-unsplash.avif", "innsbruck_town_austria_winter_evening_basilica_tourists_street_signs-931380.avif", "denise-jans-w6H5YaQDQvU-unsplash.avif", "julian-ostarek-uiJL8FRqbxg-unsplash.avif", "yoav-aziz-aqaWWAglHD4-unsplash.avif", "lucas-derksen-m0YDXBXKcfk-unsplash.avif", "ilia-bronskiy-XLh8GxVreRw-unsplash.avif", "alex-aperios-tK4iQTi7xIU-unsplash.avif", "bastien-nvs-Q4ANSeZv4DI-unsplash.avif", "ingrid-martinussen-oZ2EiBXhZnE-unsplash.avif", "anna-hunko-M3Ys5KmTpPQ-unsplash.avif", "zhu-yunxiao-6BmhPOGd-To-unsplash.avif", "simon-spring-hMXuz3FLgYI-unsplash.avif", "kevin-bessat-71jm0AIfDFs-unsplash.avif", "alen-karso-V9Kym_vc3IA-unsplash.avif", "shannia-christanty-jQmIyvlOgu4-unsplash.avif", "fajar-al-hadi-Jzw6a9A83-M-unsplash.avif", "hailey-tong-7u857X3jN_8-unsplash.avif", "daniel-sessler-ebdq6h8lmfg-unsplash.avif", "ash-coronado-VgTI-14Mi2c-unsplash.avif", "eric-knoll-Sb7Bs2qE5Kc-unsplash.avif", "kristijan-arsov-C8ilked7AJ8-unsplash.avif", "ilia-bronskiy-naZRwymOuQU-unsplash.avif", "edgar-lrkE3Xeu1ZA-unsplash.avif", "alexander-kovalev-fto-gWUdppA-unsplash.avif", "calin-stan-pxquJuM4RLo-unsplash.avif", "steam-train-crossing-glenfinnan-viaduct-in-scottish-highlands.avif", "adrian-hernandez-H4yXyzzIrh8-unsplash.avif", "andrii-khrystian-etHqZeMNUEI-unsplash.avif", "jonathan-borba-fbDUP5JhkTo-unsplash.avif", "richard-hatleskog-qdfgnNy64NY-unsplash.avif", "andreas-fischinger-cy0WTvSGl70-unsplash.avif", "bastien-nvs-q1cknPlmnSM-unsplash.avif", "georg-eiermann-BpZfURGCElo-unsplash.avif", "adam-bignell-8wuzKBoGz-A-unsplash.avif", "pierre-blache-6Sa3eHcMX1c-unsplash.avif", "kemal-berkay-dogan-w-giZAK3fYA-unsplash.avif", "lena-le-roy-6CB2ZZDxqwY-unsplash.avif", "adrianna-geo-1rBg5YSi00c-unsplash.avif", "compagnons-SnTlp_lVxEY-unsplash.avif", "alexis-presa-PfaM1ozY0rQ-unsplash.avif", "nikol-shtereva-ba8gEQYuYLE-unsplash.avif", "f-a-grafie-UgNyX08aUQM-unsplash.avif", "joris-van-der-zalm-8kkoRSgUQLs-unsplash.avif", "bob-van-aubel-LI2qNpXXyBY-unsplash.avif", "anna-hunko-ZYdaodM5caA-unsplash.avif", "julia-elliot-h17arYIJwjg-unsplash.avif", "sebastien-goldberg-1Rd7PW7ad3I-unsplash.avif", "stan-jacobs-uQWd8DuvzRY-unsplash.avif", "keszthelyi-timi-Ee9sCVNJL7c-unsplash.avif", "jonas-jaeken-emldMXCEfvI-unsplash.avif", "crystal-palace-in-retiro-park-madrid-at-dusk-with-water-reflections.avif", "frank-chou-rAzcSCGlq_o-unsplash.avif", "chris-liverani-XAnIZclLbx4-unsplash.avif", "2011-06-06_13-34-51_Switzerland_Cantone_Ticino_Sonogno.avif", "bharat-patil-w9urZNaJYC4-unsplash.avif", "leonhard-niederwimmer-kGJySkOYJTk-unsplash.avif", "vikram-ey660TnAmcc-unsplash.avif", "val-vesa-QWwDuyb1VuY-unsplash.avif", "maria-sime-jitfW6brTGg-unsplash.avif", "priyesh-maurya-kFdzeS7nayk-unsplash.avif", "gruescu-ovidiu-JPNhZicZ-VM-unsplash.avif", "karel-mistrik-nkhXGQ_UDFc-unsplash.avif", "martti-salmi-PPcZ3Y8Pffo-unsplash.avif", "michael-lammli-a91lDWfAYsk-unsplash.avif", "manueline-gothic-cloister-architecture-with-arched-columns.avif", "cameron-gibson-B-m69JIarEk-unsplash.avif", "joseph-sun-6AzoeXJp6Ck-unsplash.avif", "cheuk-wai-lee--CquNKLp7B4-unsplash.avif", "gabriel-miklos-qRdhPKfps9k-unsplash.avif"];

    let shuffledImages = [];
    let currentIndex = 0;

    function shuffleImages() {
        shuffledImages = [...images];

        for (let i = shuffledImages.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            [shuffledImages[i], shuffledImages[j]] =
            [shuffledImages[j], shuffledImages[i]];
        }
    }

    function showNextImage() {
        if (currentIndex >= shuffledImages.length) {
            shuffleImages();
            currentIndex = 0;
        }

        console.log(shuffledImages[currentIndex]);

        photo.src = imageDirectory + shuffledImages[currentIndex];

        currentIndex++;

        const delay = 3500 + Math.random() * 1000;

        setTimeout(showNextImage, delay);
    }

    shuffleImages();
    showNextImage();
}


// INITIAL VALIDATION

run(false);
status.textContent = 'Awaiting Haericode input'

document.addEventListener("DOMContentLoaded", () => {
    if (window.matchMedia("(max-width: 850px)").matches) {
        alert("Frontend may not work as intended on mobile.");

        document.querySelectorAll("h2").forEach(h => {
            const content = [];
            let el = h.nextElementSibling;

            while (el && el.tagName !== "H2") {
                content.push(el);
                el = el.nextElementSibling;
            }

            const toggle = () => {
                const closed = content[0]?.hidden;

                content.forEach(el => el.hidden = !closed);

                if (h.classList.contains("mobile-last")) {
                    h.classList.toggle("mobile-last-closed", !closed);
                }
            };

            h.addEventListener("click", toggle);

            content.forEach(el => el.hidden = true);

            if (h.classList.contains("mobile-last")) {
                h.classList.add("mobile-last-closed");
            }
        });
    }
});
