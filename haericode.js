(function (global) {
  "use strict";

  const VERSION = 1;

  const IDENTITIES_URL = "library/identities.json"; 
  /* 
    You can also link it to the identities.json in our Github repository, it will always be up to date: 
    "https://raw.githubusercontent.com/Haericode/haericode.github.io/refs/heads/main/library/identities.json" 
  */
  const DIASPORAS_URL = "library/diasporas.json";
  const METADATA_URL = "library/metadata.json";

  let identitiesData = null;
  let diasporasData = null;
  let metadataData = null;
  let metadataSourcesData = {};

  function fail(message) {
    throw new Error(`Error; ${message}`);
  }


  /* DATA LOADING */

  async function fetchJson(url, label) {
    const response = await fetch(url, {
      cache: "no-cache"
    });

    if (!response.ok) {
      fail(
        `Could not load ${label}: ${url} ` +
        `(${response.status} ${response.statusText})`
      );
    }

    return response.json();
  }


  async function loadOntology({
    identitiesUrl = IDENTITIES_URL,
    diasporasUrl = DIASPORAS_URL,
    metadataUrl = METADATA_URL
  } = {}) {

    const [
      identities,
      diasporas,
      metadata
    ] = await Promise.all([
      fetchJson(
        identitiesUrl,
        "Haericode identities"
      ),

      fetchJson(
        diasporasUrl,
        "Haericode diasporas"
      ),

      fetchJson(
        metadataUrl,
        "Haericode metadata definitions"
      )
    ]);

    validateIdentities(identities);
    validateDiasporas(diasporas);
    validateMetadata(metadata);

    const metadataSources = {};
    const sourcePromises = [];

    for (
      const prefix of Object.keys(metadata.types)
    ) {
      const definition =
      metadata.types[prefix];

      if (
        definition.source === "diasporas"
      ) {
        continue;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          metadataSources,
          definition.source
        )
      ) {
        continue;
      }

      sourcePromises.push(
        fetchJson(
          `library/${definition.source}`,
          `Haericode metadata source ${definition.source}`
        ).then(
          sourceData => {
            validateMetadataSource(
              sourceData,
              definition.source
            );

            metadataSources[
              definition.source
            ] = sourceData;
          }
        )
      );
    }

    await Promise.all(sourcePromises);

    identitiesData = identities;
    diasporasData = diasporas;
    metadataData = metadata;
    metadataSourcesData = metadataSources;

    validateDiasporaDefaultIdentity(
      diasporas
    );

    return {
      identities,
      diasporas,
      metadata,
      metadataSources
    };
  }

  const ready = loadOntology();


  /* GENERIC DATA VALIDATION */

  function validateIdentityCollection(
    data,
    collectionName
  ) {
    if (
      !data ||
      typeof data !== "object"
    ) {
      fail(
        `${collectionName} must be an object`
      );
    }

    if (
      typeof data.version !== "number"
    ) {
      fail(
        `${collectionName} version must be a number`
      );
    }

    if (
      !data.identities ||
      typeof data.identities !== "object"
    ) {
      fail(
        `${collectionName} must contain an identities object`
      );
    }
  }


  function validateIdentityRelationships(
    identities,
    collectionName
  ) {
    for (
      const code of Object.keys(identities)
    ) {
      const identity =
      identities[code];

      if (
        !identity ||
        typeof identity !== "object"
      ) {
        fail(
          `Invalid ${collectionName} identity: ${code}`
        );
      }

      if (
        identity.code !== code
      ) {
        fail(
          `${collectionName} identity ` +
          `key/code mismatch: ${code}`
        );
      }

      if (
        typeof identity.name !== "string" ||
        identity.name.length === 0
      ) {
        fail(
          `${collectionName} identity ${code} ` +
          `has no valid English name`
        );
      }

      if (
        !Array.isArray(
          identity.relationships
        )
      ) {
        fail(
          `${collectionName} identity ${code} ` +
          `has invalid relationships`
        );
      }

      for (
        const relation
        of identity.relationships
      ) {
        if (
          !relation ||
          typeof relation !== "object"
        ) {
          fail(
            `${collectionName} identity ${code} ` +
            `has an invalid relationship`
          );
        }

        if (
          relation.type !== "classifications" &&
          relation.type !== "broaderIdentities"
        ) {
          fail(
            `${collectionName} identity ${code} ` +
            `has invalid relationship type: ` +
            `${relation.type}`
          );
        }

        if (
          !Array.isArray(relation.code)
        ) {
          fail(
            `${collectionName} identity ${code} ` +
            `relationship ${relation.type} ` +
            `must contain an array of codes`
          );
        }

        for (
          const relatedCode
          of relation.code
        ) {
          if (
            typeof relatedCode !== "string" ||
            relatedCode.length === 0
          ) {
            fail(
              `${collectionName} identity ${code} ` +
              `has an invalid ${relation.type} code`
            );
          }

          if (
            relation.type === "broaderIdentities" &&
            !Object.prototype.hasOwnProperty.call(
              identities,
              relatedCode
            )
          ) {
            fail(
              `${collectionName} identity ${code} ` +
              `references unknown broader identity ` +
              `${relatedCode}`
            );
          }
        }
      }

      const relationshipTypes =
      new Set();

      for (
        const relation
        of identity.relationships
      ) {
        if (
          relationshipTypes.has(
            relation.type
          )
        ) {
          fail(
            `${collectionName} identity ${code} ` +
            `defines relationship type ` +
            `${relation.type} more than once`
          );
        }

        relationshipTypes.add(
          relation.type
        );

        if (
          new Set(
            relation.code
          ).size !== relation.code.length
        ) {
          fail(
            `${collectionName} identity ${code} ` +
            `contains duplicate ${relation.type} codes`
          );
        }
      }
    }

    const visiting =
    new Set();

    const visited =
    new Set();

    function visit(
      code,
      path = []
    ) {
      if (
        visiting.has(code)
      ) {
        fail(
          `${collectionName} contains a circular ` +
          `broader identity relationship: ` +
          `${path.concat(code).join(" -> ")}`
        );
      }

      if (
        visited.has(code)
      ) {
        return;
      }

      visiting.add(code);

      const identity =
      identities[code];

      if (
        identity &&
        Array.isArray(identity.relationships)
      ) {
        const broaderRelation =
        identity.relationships.find(
          relation =>
          relation.type ===
          "broaderIdentities"
        );

        if (
          broaderRelation
        ) {
          for (
            const broaderCode
            of broaderRelation.code
          ) {
            visit(
              broaderCode,
              path.concat(code)
            );
          }
        }
      }

      visiting.delete(code);
      visited.add(code);
    }

    for (
      const code of Object.keys(identities)
    ) {
      visit(code);
    }
  }


  function validateIdentities(data) {
    validateIdentityCollection(
      data,
      "Identities"
    );

    validateIdentityRelationships(
      data.identities,
      "identity"
    );

    return true;
  }

  function validateDiasporas(data) {
    if (
      !data ||
      typeof data !== "object"
    ) {
      fail(
        "Diasporas must be an object"
      );
    }

    if (
      typeof data.version !== "number"
    ) {
      fail(
        "Diasporas version must be a number"
      );
    }

    if (
      !data.identities ||
      typeof data.identities !== "object"
    ) {
      fail(
        "Diasporas must contain an identities object"
      );
    }

    if (
      typeof data.defaultIdentity !== "string" ||
      data.defaultIdentity.length === 0
    ) {
      fail(
        "Diasporas must define a defaultIdentity"
      );
    }

    if (
      !identitiesData &&
      !(
        identitiesData &&
        identitiesData.identities &&
        Object.prototype.hasOwnProperty.call(
          identitiesData.identities,
          data.defaultIdentity
        )
      )
    ) {
    }

    for (
      const code of Object.keys(data.identities)
    ) {
      const diaspora =
      data.identities[code];

      if (
        !diaspora ||
        typeof diaspora !== "object"
      ) {
        fail(
          `Invalid diaspora identity: ${code}`
        );
      }

      if (
        diaspora.code !== code
      ) {
        fail(
          `Diaspora identity key/code mismatch: ${code}`
        );
      }

      if (
        typeof diaspora.name !== "string" ||
        diaspora.name.length === 0
      ) {
        fail(
          `Diaspora identity ${code} ` +
          `has no valid name`
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          diaspora,
          "relationships"
        )
      ) {
        fail(
          `Diaspora ${code} must not define ` +
          `relationships; diaspora relationships ` +
          `are generated dynamically`
        );
      }
    }

    return true;
  }

  function validateDiasporaDefaultIdentity(
    diasporas
  ) {
    if (
      !identitiesData ||
      !identitiesData.identities
    ) {
      return true;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        identitiesData.identities,
        diasporas.defaultIdentity
      )
    ) {
      fail(
        `Diaspora defaultIdentity ` +
        `${diasporas.defaultIdentity} ` +
        `does not exist in identities.json`
      );
    }

    return true;
  }

  function validateMetadataSource(
    data,
    sourceName
  ) {
    if (
      !data ||
      typeof data !== "object"
    ) {
      fail(
        `Metadata source ${sourceName} must be an object`
      );
    }

    if (
      typeof data.version !== "number"
    ) {
      fail(
        `Metadata source ${sourceName} ` +
        `version must be a number`
      );
    }

    if (
      !data.identities ||
      typeof data.identities !== "object"
    ) {
      fail(
        `Metadata source ${sourceName} ` +
        `must contain an identities object`
      );
    }

    for (
      const code of Object.keys(data.identities)
    ) {
      const identity =
      data.identities[code];

      if (
        !identity ||
        typeof identity !== "object"
      ) {
        fail(
          `Invalid metadata identity ` +
          `${code} in ${sourceName}`
        );
      }

      if (
        identity.code !== code
      ) {
        fail(
          `Metadata identity key/code mismatch: ` +
          `${sourceName}:${code}`
        );
      }

      if (
        typeof identity.name !== "string" ||
        identity.name.length === 0
      ) {
        fail(
          `Metadata identity ${sourceName}:${code} ` +
          `has no valid name`
        );
      }
    }

    return true;
  }

  /* METADATA VALIDATION */

  function validateMetadata(data) {
    if (
      !data ||
      typeof data !== "object"
    ) {
      fail(
        "Metadata definitions must be an object"
      );
    }

    if (
      typeof data.version !== "number"
    ) {
      fail(
        "Metadata definitions version must be a number"
      );
    }

    if (
      !data.types ||
      typeof data.types !== "object"
    ) {
      fail(
        "Metadata definitions must contain a types object"
      );
    }

    for (
      const prefix of Object.keys(data.types)
    ) {
      const definition =
      data.types[prefix];

      if (
        !definition ||
        typeof definition !== "object"
      ) {
        fail(
          `Invalid metadata definition: ${prefix}`
        );
      }

      if (
        typeof definition.name !== "string" ||
        !definition.name
      ) {
        fail(
          `Metadata ${prefix} has no valid name`
        );
      }

      if (
        typeof definition.source !== "string" ||
        definition.source.length === 0
      ) {
        fail(
          `Metadata ${prefix} has no valid source`
        );
      }

    }

    return true;
  }

  /* DATA ACCESS */

  function requireData() {
    if (
      !identitiesData ||
      !diasporasData ||
      !metadataData ||
      !metadataSourcesData
    ) {
      fail(
        "Haericode data has not loaded yet. " +
        "Await Haericode.ready before using the parser."
      );
    }

    validateDiasporaDefaultIdentity(
      diasporasData
    );

    return {
      identities: identitiesData,
      diasporas: diasporasData,
      metadata: metadataData,
      metadataSources: metadataSourcesData
    };
  }

  function getIdentity(code) {
    const data = requireData();

    return (
      data.identities.identities[code] ||
      null
    );
  }

  function identityExists(code) {
    const data =
    requireData();

    return Object.prototype.hasOwnProperty.call(
      data.identities.identities,
      code
    );
  }

  function identityName(code) {
    const identity =
    getIdentity(code);

    return identity
    ? identity.name
    : null;
  }

  function getDiaspora(code) {
    const data =
    requireData();

    return (
      data.diasporas.identities[code] ||
      null
    );
  }

  function diasporaExists(code) {
    const data =
    requireData();

    return Object.prototype.hasOwnProperty.call(
      data.diasporas.identities,
      code
    );
  }

  function diasporaName(code) {
    const diaspora =
    getDiaspora(code);

    return diaspora
    ? diaspora.name
    : null;
  }

  function defaultDiasporaIdentityCode() {
    const data =
    requireData();

    return data.diasporas.defaultIdentity;
  }

  function getMetadataSource(
    source
  ) {
    requireData();

    return (
      metadataSourcesData[source] ||
      null
    );
  }

  function metadataSourceExists(
    source
  ) {
    requireData();

    return Object.prototype.hasOwnProperty.call(
      metadataSourcesData,
      source
    );
  }

  function getMetadataIdentity(
    source,
    code
  ) {
    const data =
    getMetadataSource(source);

    if (!data) {
      return null;
    }

    return (
      data.identities[code] ||
      null
    );
  }

  function metadataIdentityExists(
    source,
    code
  ) {
    const data =
    getMetadataSource(source);

    if (!data) {
      return false;
    }

    return Object.prototype.hasOwnProperty.call(
      data.identities,
      code
    );
  }

  /* IDENTITY RELATIONSHIPS */

  function relationshipGroupOf(
    code,
    type
  ) {
    const identity =
    getIdentity(code);

    if (!identity) {
      return [];
    }

    const relationship =
    identity.relationships.find(
      relation =>
      relation.type === type
    );

    if (
      !relationship
    ) {
      return [];
    }

    return relationship.code.slice();
  }

  function relationshipsOf(
    code,
    type
  ) {
    const identity =
    getIdentity(code);

    if (!identity) {
      return [];
    }

    const relationships = [];

    for (
      const relation
      of identity.relationships
    ) {
      if (
        type &&
        relation.type !== type
      ) {
        continue;
      }

      for (
        const relatedCode
        of relation.code
      ) {
        if (
          relation.type === "broaderIdentities" &&
          relatedCode === code
        ) {
          fail(
            `Identity ${code} ` +
            `cannot list itself as a broader identity`
          );
        }
        relationships.push({
          type:
          relation.type,

          code:
          relatedCode
        });
      }
    }

    return relationships;
  }


  function broaderOf(code) {
    return broaderIdentityOf(code);
  }


  function broaderIdentityOf(code) {
    return relationshipsOf(
      code,
      "broaderIdentities"
    );
  }


  function classificationsOf(code) {
    return relationshipsOf(
      code,
      "classifications"
    );
  }


  function broaderIdentityCodesOf(
    code
  ) {
    return relationshipGroupOf(
      code,
      "broaderIdentities"
    );
  }


  function classificationCodesOf(
    code
  ) {
    return relationshipGroupOf(
      code,
      "classifications"
    );
  }


  /* DIASPORA RELATIONSHIPS */

  function diasporaRelationshipsOf(
    code,
    type
  ) {
    const diaspora =
    getDiaspora(code);

    if (!diaspora) {
      return [];
    }

    return [];
  }


  function broaderDiasporaOf(code) {
    return [];
  }

  /* RECURSIVE IDENTITY INTERPRETATION*/

  function interpretEntry(
    entry
  ) {
    if (
      entry.identity === "?"
    ) {
      return {
        identity: "?",
        name: "Unknown",
        relationships: []
      };
    }

    const expression =
    parseIdentityExpression(
      entry.identity
    );

    const interpreted =
    interpretIdentity(
      expression.identity
    );

    if (!interpreted) {
      fail(
        `Unknown Haericode identity code: ` +
        `${expression.identity}`
      );
    }

    const relationships =
    interpreted.relationships.slice();

    let selectedChild =
    null;

    for (
      let i =
      expression.broader.length - 1;
    i >= 0;
    i--
    ) {
      const broaderCode =
      expression.broader[i];

      const broader =
      interpretIdentity(
        broaderCode
      );

      if (!broader) {
        fail(
          `Unknown broader identity code: ` +
          `${broaderCode}`
        );
      }

      const broaderRelationships =
      broader.relationships.slice();

      if (
        selectedChild
      ) {
        broaderRelationships.push(
          selectedChild
        );
      }

      selectedChild = {
        type:
        "broaderIdentity",

        identity:
        broader.identity,

        name:
        broader.name,

        relationships:
        broaderRelationships
      };
    }

    if (
      selectedChild
    ) {
      relationships.push(
        selectedChild
      );
    }

    return {
      identity:
      interpreted.identity,

      name:
      interpreted.name,

      relationships
    };
  }

  /* DIASPORA COMPOUND IDENTITIES */

  function interpretJewish(code) {
    const community =
    getJewishCommunity(code);

    if (!community) {
      return null;
    }

    return {
      identity:
      community.code,

      name:
      community.name,

      relationships: []
    };
  }


  const DIASPORA_COMPOUND_RE =
  /^([A-Za-z0-9@*_-]+)-([A-Za-z0-9@*_-]+)$/;


  function parseDiasporaCode(code) {

    if (
      diasporaExists(code)
    ) {
      return {
        identityCode:
        defaultDiasporaIdentityCode(),

 diasporaCode:
 code
      };
    }

    const match =
    code.match(
      DIASPORA_COMPOUND_RE
    );

    if (!match) {
      return null;
    }

    const identityCode =
    match[1];

    const diasporaCode =
    match[2];

    if (
      !identityExists(
        identityCode
      )
    ) {
      fail(
        `Unknown diaspora identity component: ` +
        `${identityCode}`
      );
    }

    if (
      !diasporaExists(
        diasporaCode
      )
    ) {
      fail(
        `Unknown diaspora denonym code: ` +
        `${diasporaCode}`
      );
    }

    return {
      identityCode,
      diasporaCode
    };
  }


  function compoundDiasporaName(
    identityCode,
    diasporaCode
  ) {
    const identity =
    getIdentity(identityCode);

    const diaspora =
    getDiaspora(diasporaCode);

    if (!identity) {
      fail(
        `Unknown diaspora identity component: ` +
        `${identityCode}`
      );
    }

    if (!diaspora) {
      fail(
        `Unknown diaspora denonym code: ` +
        `${diasporaCode}`
      );
    }

    return (
      `${identity.name} ${diaspora.name}`
    );
  }


  function interpretDiasporaCode(
    code,
    visited = new Set()
  ) {

    const parsed =
    parseDiasporaCode(code);

    if (!parsed) {
      return null;
    }

    const identityCode =
    parsed.identityCode;

    const diasporaCode =
    parsed.diasporaCode;

    const compoundCode =
    `${identityCode}-${diasporaCode}`;

    if (
      visited.has(compoundCode)
    ) {
      fail(
        `Circular diaspora relationship detected at ` +
        `${compoundCode}`
      );
    }

    const nextVisited =
    new Set(visited);

    nextVisited.add(compoundCode);

    const name =
    compoundDiasporaName(
      identityCode,
      diasporaCode
    );

    const defaultIdentityCode =
    defaultDiasporaIdentityCode();

    const relationships = [];

    if (
      identityCode !==
      defaultIdentityCode
    ) {
      const broaderCode =
      `${defaultIdentityCode}-${diasporaCode}`;

      const broader =
      interpretDiasporaCode(
        broaderCode,
        nextVisited
      );

      if (broader) {
        relationships.push({
          type: "broader",

          identity:
          broader.identity,

          name:
          broader.name,

          relationships:
          broader.relationships
        });
      }
    }

    return {
      identity:
      compoundCode,

      name,

      relationships
    };
  }

  function interpretDiaspora(
    code
  ) {
    const interpreted =
    interpretDiasporaCode(code);

    if (!interpreted) {
      return null;
    }

    return interpreted;
  }


  /* Haericode SYNTAX */

  const ID_RE =
  /^[A-Za-z0-9@*_-]+$/;

  const DIASPORA_RE =
  /^[A-Za-z0-9@*_-]+(?:\+[A-Za-z0-9@*_-]+)*$/;

  const IDENTITY_EXPRESSION_RE =
  /^[A-Za-z0-9@*_-]+(?:-[A-Za-z0-9@*_-]+)*$/;


  function parseIdentityExpression(
    expression
  ) {
    if (
      !IDENTITY_EXPRESSION_RE.test(
        expression
      )
    ) {
      fail(
        `Invalid identity expression: ${expression}`
      );
    }

    const parts =
    expression.split("-");

    const identityCode =
    parts[0];

    if (
      !identityExists(
        identityCode
      )
    ) {
      fail(
        `Unknown Haericode identity code: ` +
        `${identityCode}`
      );
    }

    const broader =
    parts.slice(1);

    let current =
    identityCode;

    const visited =
    new Set([
      identityCode
    ]);

    for (
      const broaderCode
      of broader
    ) {
      if (
        visited.has(
          broaderCode
        )
      ) {
        fail(
          `Identity expression contains a repeated ` +
          `identity: ${broaderCode}`
        );
      }

      if (
        !identityExists(
          broaderCode
        )
      ) {
        fail(
          `Unknown broader identity code: ` +
          `${broaderCode}`
        );
      }

      const allowed =
      broaderIdentityCodesOf(
        current
      );

      if (
        !allowed.includes(
          broaderCode
        )
      ) {
        fail(
          `Identity ${current} does not permit ` +
          `${broaderCode} as a broader identity`
        );
      }

      visited.add(
        broaderCode
      );

      current =
      broaderCode;
    }

    return {
      identity:
      identityCode,

      broader
    };
  }

  function parsePercent(text) {
    if (
      !/^(?:\d+(?:\.\d{1,3})?)$/.test(
        text
      )
    ) {
      fail(
        `Invalid percentage: ${text}`
      );
    }

    const number =
    Number(text);

    if (
      !Number.isFinite(number) ||
      number <= 0 ||
      number > 100
    ) {
      fail(
        `Percentage must be > 0 and <= 100, currently ${text}`
      );
    }

    return number;
  }


  function percentText(number) {
    if (
      Number.isInteger(number)
    ) {
      return String(number);
    }

    return String(number)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
  }


  function splitTopLevel(text) {
    const result = [];

    let depth = 0;
    let start = 0;

    for (
      let i = 0;
    i < text.length;
    i++
    ) {
      const character =
      text[i];

      if (
        character === "("
      ) {
        depth++;
      }

      else if (
        character === ")"
      ) {
        depth--;

        if (
          depth < 0
        ) {
          fail(
            "Unexpected ')'"
          );
        }
      }

      else if (
        character === "/" &&
        depth === 0
      ) {
        result.push(
          text.slice(
            start,
            i
          )
        );

        start =
        i + 1;
      }
    }

    if (
      depth !== 0
    ) {
      fail(
        "Unclosed parenthesis"
      );
    }

    result.push(
      text.slice(start)
    );

    if (
      result.some(
        component =>
        component === ""
      )
    ) {
      fail(
        "Empty component"
      );
    }

    return result;
  }


  /* COMPONENT PARSING */

  function parseComponent(raw) {
    let uncertain = false;
    let text = raw;

    if (
      text.startsWith("!")
    ) {
      uncertain = true;
      text =
      text.slice(1);
    }

    const colon =
    text.indexOf(":");

    if (
      colon <= 0
    ) {
      fail(
        `Invalid component: ${raw}`
      );
    }

    const percentageText =
    text.slice(
      0,
      colon
    );

    const identity =
    text.slice(
      colon + 1
    );

    const percentage =
    parsePercent(
      percentageText
    );

    if (
      identity !== "?" &&
      !IDENTITY_EXPRESSION_RE.test(
        identity
      )
    ) {
      fail(
        `Invalid identity expression: ${identity}`
      );
    }

    if (
      identity !== "?"
    ) {
      parseIdentityExpression(
        identity
      );
    }

    return {
      identity,

      percentage,

      markers:
      uncertain
      ? ["uncertainty"]
      : []
    };
  }


  function parseCompositionParts(
    parts,
    context
  ) {
    if (
      !parts.length
    ) {
      fail(
        `Empty ${context} composition`
      );
    }

    const components =
    parts.map(
      parseComponent
    );

    const sum =
    components.reduce(
      (
        total,
       component
      ) =>
      total +
      component.percentage,
      0
    );

    if (
      Math.abs(
        sum - 100
      ) > 1e-9
    ) {
      fail(
        `${context} composition must total 100%; ` +
        `got ${percentText(sum)}%`
      );
    }

    return components;
  }

  /* PARENTAGE */

  function parseParent(raw) {
    const match =
    raw.match(
      /^\^([PM]+)\((.*)\)$/
    );

    if (!match) {
      fail(
        `Invalid parentage component: ${raw}`
      );
    }

    const path =
    match[1];

    const inside =
    match[2];

    if (
      !inside
    ) {
      fail(
        `Empty parentage composition: ${raw}`
      );
    }

    if (
      inside.includes("^") ||
      inside.includes("(") ||
      inside.includes(")")
    ) {
      fail(
        `Nested parentage is not allowed: ${raw}`
      );
    }

    const parts =
    inside.split("/");

    const composition =
    parseCompositionParts(
      parts,
      `parent ${path}`
    );

    return {
      path,
      composition
    };
  }

  /* METADATA */

  function getMetadataDefinition(
    prefix
  ) {
    const data =
    requireData();

    return (
      data.metadata.types[prefix] ||
      null
    );
  }

  function metadataCodeExists(
    prefix,
    code
  ) {
    const definition =
    getMetadataDefinition(prefix);

    if (!definition) {
      return false;
    }

    if (
      definition.source === "diasporas"
    ) {
      return !!parseDiasporaCode(code);
    }

    return metadataIdentityExists(
      definition.source,
      code
    );
  }

  function interpretMetadata(
    prefix,
    code
  ) {
    const definition =
    getMetadataDefinition(prefix);

    if (!definition) {
      fail(
        `Unknown metadata type: ${prefix}`
      );
    }

    if (
      definition.source === "diasporas"
    ) {
      const interpreted =
      interpretDiasporaCode(code);

      if (!interpreted) {
        fail(
          `Unknown metadata diaspora: ${code}`
        );
      }

      return {
        type:
        definition.name,

        identity:
        interpreted.identity,

        name:
        interpreted.name,

        relationships:
        interpreted.relationships
      };
    }

    const identity =
    getMetadataIdentity(
      definition.source,
      code
    );

    if (!identity) {
      fail(
        `Unknown ${definition.name} metadata code: ${code}`
      );
    }

    return {
      type:
      definition.name,

      identity:
      identity.code,

      name:
      identity.name,

      relationships:
      Array.isArray(identity.relationships)
      ? identity.relationships
      : []
    };
  }

  function parseMetadata(raw) {
    if (
      !raw.startsWith("#")
    ) {
      fail(
        `Invalid metadata component: ${raw}`
      );
    }

    const colon =
    raw.indexOf(":");

    if (
      colon <= 1
    ) {
      fail(
        `Invalid metadata component: ${raw}`
      );
    }

    const prefix =
    raw.slice(
      1,
      colon
    );

    const code =
    raw.slice(
      colon + 1
    );

    const definition =
    getMetadataDefinition(
      prefix
    );

    if (!definition) {
      fail(
        `Unknown metadata type: #${prefix}`
      );
    }

    if (
      definition.source ===
      "diasporas"
    ) {
      if (
        !DIASPORA_RE.test(code)
      ) {
        fail(
          `Invalid diaspora metadata code: ${code}`
        );
      }
    }

    else if (
      !ID_RE.test(code)
    ) {
      fail(
        `Invalid metadata code: ${code}`
      );
    }

    if (
      !metadataCodeExists(
        prefix,
        code
      )
    ) {
      fail(
        `Unknown ${definition.name} metadata code: ${code}`
      );
    }

    return {
      prefix,
      code
    };
  }


  function isMetadata(text) {
    return text.startsWith("#");
  }

  /* PARENTAGE VALIDATION */

  function validatePrefixFree(paths) {
    const sorted =
    [...paths].sort(
      (a, b) =>
      a.length - b.length ||
      a.localeCompare(b)
    );

    for (
      let i = 0;
    i < sorted.length;
    i++
    ) {
      for (
        let j = i + 1;
      j < sorted.length;
      j++
      ) {
        if (
          sorted[j].startsWith(
            sorted[i]
          )
        ) {
          fail(
            `Contradictory parentage: ` +
            `${sorted[i]} is an ancestor path ` +
            `of ${sorted[j]}`
          );
        }
      }
    }
  }

  /* PARSER */

  function parse(input) {
    requireData();

    if (
      typeof input !== "string"
    ) {
      fail(
        "Haericode must be a string"
      );
    }

    const text =
    input.trim();

    if (
      !text.startsWith("HC/")
    ) {
      fail(
        "Haericode must begin with HC/"
      );
    }

    const body =
    splitTopLevel(
      text.slice(3)
    );

    const metadata = [];
    const data = [];

    for (
      const token of body
    ) {
      if (
        isMetadata(token)
      ) {
        metadata.push(
          parseMetadata(token)
        );
      }

      else {
        data.push(token);
      }
    }

    if (
      !data.length
    ) {
      fail(
        "Haericode must contain ancestry data"
      );
    }

    const hasParent =
    data.some(
      token =>
      token.startsWith("^")
    );

    const hasDirect =
    data.some(
      token =>
      !token.startsWith("^")
    );

    if (
      hasParent &&
      hasDirect
    ) {
      fail(
        "A Haericode must use composition mode " +
        "OR parentage mode, not both"
      );
    }

    let mode;
    let entries;

    if (
      hasParent
    ) {
      mode =
      "parentage";

      entries =
      data.map(
        parseParent
      );

      validatePrefixFree(
        entries.map(
          entry =>
          entry.path
        )
      );
    }

    else {
      mode =
      "composition";

      entries =
      parseCompositionParts(
        data,
        "root"
      );
    }

    return {
      version: VERSION,

      mode,

      entries,

      metadata
    };
  }

  /* CANONICALIZATION */

  function identityCompare(
    a,
    b
  ) {
    return a.identity.localeCompare(
      b.identity
    );
  }


  function canonicalizeComposition(
    entries
  ) {
    const merged =
    new Map();

    for (
      const component of entries
    ) {
      const uncertain =
      component.markers &&
      component.markers.includes(
        "uncertainty"
      );

      const key =
      `${uncertain ? "!" : ""}` +
      `${component.identity}`;

      if (
        !merged.has(key)
      ) {
        merged.set(
          key,
          {
            ...component,

            markers:
            uncertain
            ? ["uncertainty"]
            : []
          }
        );
      }

      else {
        merged.get(
          key
        ).percentage +=
        component.percentage;
      }
    }

    return [
      ...merged.values()
    ]
    .sort(
      (a, b) =>
      a.percentage - b.percentage ||
      identityCompare(a, b)
    )
    .map(
      component => {
        const uncertain =
        component.markers &&
        component.markers.includes(
          "uncertainty"
        );

        return (
          `${uncertain ? "!" : ""}` +
          `${percentText(
            component.percentage
          )}` +
          `:${component.identity}`
        );
      }
    );
  }

  function canonicalizeParent(
    parent
  ) {
    return (
      `^${parent.path}(` +
      `${canonicalizeComposition(
        parent.composition
      ).join("/")}` +
      `)`
    );
  }

  function canonicalize(
    parsed
  ) {
    const data =
    parsed.mode ===
    "composition"

    ? canonicalizeComposition(
      parsed.entries
    )

    : parsed.entries
    .slice()
    .sort(
      (a, b) =>
      a.path.length -
      b.path.length ||
      a.path.localeCompare(
        b.path
      )
    )
    .map(
      canonicalizeParent
    );

    const metadata =
    parsed.metadata
    .slice()
    .sort(
      (a, b) =>
      a.prefix.localeCompare(
        b.prefix
      ) ||
      a.code.localeCompare(
        b.code
      )
    )
    .map(
      metadataEntry =>
      `#${metadataEntry.prefix}:` +
      `${metadataEntry.code}`
    );

    return (
      `HC/` +
      data
      .concat(metadata)
      .join("/")
    );
  }

  /* PARENTAGE DERIVATION */

  function decimalToThousandths(
    number
  ) {
    return BigInt(
      Math.round(
        number * 1000
      )
    );
  }

  function gcd(a, b) {
    a =
    a < 0n
    ? -a
    : a;

    b =
    b < 0n
    ? -b
    : b;

    while (
      b !== 0n
    ) {
      const temp =
      a % b;

      a = b;
      b = temp;
    }

    return a;
  }


  function addRat(a, b) {
    const numerator =
    a.n * b.d +
    b.n * a.d;

    const denominator =
    a.d * b.d;

    const g =
    gcd(
      numerator,
      denominator
    );

    return {
      n:
      numerator / g,

      d:
      denominator / g
    };
  }

  function contribution(
    component,
    depth
  ) {
    const percentage =
    decimalToThousandths(
      component.percentage
    );

    return {
      n:
      percentage,

      d:
      100000n *
      (
        2n **
        BigInt(depth)
      )
    };
  }


  function ratToNumber(
    rational
  ) {
    return (
      Number(rational.n) /
      Number(rational.d)
    );
  }

  function deriveParentage(
    entries
  ) {
    const map =
    new Map();

    let covered = {
      n: 0n,
      d: 1n
    };

    for (
      const parent of entries
    ) {
      const depth =
      parent.path.length;

      const weight = {
        n: 1n,

        d:
        2n **
        BigInt(depth)
      };

      covered =
      addRat(
        covered,
        weight
      );

      for (
        const component
        of parent.composition
      ) {
        const uncertain =
        component.markers &&
        component.markers.includes(
          "uncertainty"
        );

        const key =
        `${uncertain ? "!" : ""}` +
        `${component.identity}`;

        const base =
        contribution(
          component,
          depth
        );

        if (
          !map.has(key)
        ) {
          map.set(
            key,
            base
          );
        }

        else {
          map.set(
            key,
            addRat(
              map.get(key),
                   base
            )
          );
        }
      }
    }

    const coveredNumber =
    ratToNumber(
      covered
    );

    if (
      coveredNumber >
      1 + 1e-12
    ) {
      fail(
        "Parentage covers more than " +
        "100% of root ancestry"
      );
    }

    const unknown =
    1 -
    coveredNumber;

    if (
      unknown > 1e-12
    ) {
      map.set(
        "?",
        {
          n:
          decimalToThousandths(
            unknown * 100
          ),

          d:
          100000n
        }
      );
    }

    return [
      ...map.entries()
    ]
    .map(
      ([key, rational]) => {
        const uncertain =
        key.startsWith("!");

        const identity =
        uncertain
        ? key.slice(1)
        : key;

        return {
          identity,

          markers:
          uncertain
          ? ["uncertainty"]
          : [],

          percentage:
          ratToNumber(
            rational
          ) * 100
        };
      }
    )
    .sort(
      (a, b) =>
      a.percentage -
      b.percentage ||
      a.identity.localeCompare(
        b.identity
      )
    );
  }

  /* INTERPRETATION */

  function interpretIdentity(
    code,
    visited = new Set()
  ) {
    const identity =
    getIdentity(code);

    if (!identity) {
      return null;
    }

    if (
      visited.has(code)
    ) {
      fail(
        `Circular identity relationship detected at ${code}`
      );
    }

    const nextVisited =
    new Set(visited);

    nextVisited.add(code);

    const relationships = [];

    const classifications =
    classificationCodesOf(
      code
    );

    for (
      const classificationCode
      of classifications
    ) {
      const related =
      getIdentity(
        classificationCode
      );

      if (!related) {
        fail(
          `Unknown classification identity referenced by ` +
          `${code}: ${classificationCode}`
        );
      }

      relationships.push({
        type:
        "classification",

        identity:
        related.code,

        name:
        related.name,

        relationships: []
      });
    }

    return {
      identity:
      identity.code,

      name:
      identity.name,

      relationships
    };
  }

  function interpretComposition(
    entries
  ) {
    return entries.map(
      entry => {
        const interpreted =
        interpretEntry(
          entry
        );

        return {
          identity:
          interpreted.identity,

          name:
          interpreted.name,

          relationships:
          interpreted.relationships,

          percentage:
          entry.percentage,

          markers:
          entry.markers || []
        };
      }
    );
  }

  /* METADATA INTERPRETATION */

  function interpretMetadataEntry(
    entry
  ) {
    const interpreted =
    interpretMetadata(
      entry.prefix,
      entry.code
    );

    return {
      type:
      interpreted.type,

      identity:
      interpreted.identity,

      name:
      interpreted.name,

      relationships:
      interpreted.relationships
    };
  }


  function interpretMetadataList(
    entries
  ) {
    return entries.map(
      interpretMetadataEntry
    );
  }

  /* INSPECTION */

  function inspect(
    parsed
  ) {
    const result = {
      version:
      parsed.version,

      mode:
      parsed.mode,

      canonical:
      canonicalize(parsed),

 metadata:
 interpretMetadataList(
   parsed.metadata
 )
    };

    if (
      parsed.mode ===
      "composition"
    ) {
      result.composition =
      interpretComposition(
        parsed.entries
      );
    }

    else {
      result.parentage =
      parsed.entries.map(
        parent => ({
          path:
          parent.path,

          composition:
          interpretComposition(
            parent.composition
          )
        })
      );

      result.derivedComposition =
      deriveParentage(
        parsed.entries
      ).map(
        entry => {
          const interpreted =
          interpretEntry(
            entry
          );

          return {
            identity:
            interpreted.identity,

            name:
            interpreted.name,

            relationships:
            interpreted.relationships,

            percentage:
            entry.percentage,

            markers:
            entry.markers || []
          };
        }
      );
    }

    return result;
  }

  /* CONVENIENCE API */

  async function parseAsync(
    input
  ) {
    await ready;

    return parse(input);
  }

  async function inspectAsync(
    input
  ) {
    await ready;

    return inspect(
      parse(input)
    );
  }

  async function canonicalizeAsync(
    input
  ) {
    await ready;

    return canonicalize(
      parse(input)
    );
  }

  /* PUBLIC API */

  global.HaericodeOntology =
  Object.freeze({

    get version() {
      return requireData()
      .identities
      .version;
    },

    get identities() {
      return requireData()
      .identities
      .identities;
    },

    get diasporas() {
      return requireData()
      .diasporas
      .identities;
    },

    get metadata() {
      return requireData()
      .metadata
      .types;
    },

    validate() {
      const data =
      requireData();

      validateIdentities(
        data.identities
      );

      validateDiasporas(
        data.diasporas
      );

      validateMetadata(
        data.metadata
      );

      validateDiasporaDefaultIdentity(
        data.diasporas
      );

      return true;
    },

    get:
    getIdentity,

    exists:
    identityExists,

    nameOf:
    identityName,

    relationshipsOf,
    broaderOf,
    broaderIdentityOf,
    classificationsOf,

    interpretIdentity,
    interpretComposition,

    getDiaspora,
    diasporaExists,
    diasporaName,
    diasporaRelationshipsOf,
    broaderDiasporaOf,

    interpretDiaspora,

    interpretMetadata
  });

  global.Haericode =
  Object.freeze({

    version: VERSION,

    ready,

    loadOntology,

    parse,
    parseAsync,

    canonicalize,
    canonicalizeAsync,

    inspect,
    inspectAsync
  });

})(window);
