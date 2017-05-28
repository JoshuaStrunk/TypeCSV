"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var fs = require("fs");
var parse = require("csv-parse/lib/sync");
var config = null;
var tableDataLookup = {};
var typedTables = {};
var validTypes = {
    "Any": function (val) { return val; },
    "String": function (val) { return val; },
    "Int": function (val) {
        var parsedInt = parseInt(val);
        if (parsedInt !== NaN && parsedInt === parseFloat(val)) {
            return parsedInt;
        }
        else {
            console.error("Attempt to convert " + val + " to int failed");
            return null;
        }
    },
    "Float": function (val) {
        var parsedFloat = parseFloat(val);
        if (parsedFloat !== NaN) {
            return parsedFloat;
        }
        else {
            console.error("Attempt to convert " + val + " to float failed");
            return null;
        }
    }
};
(function () {
    var pathToData = path.join(process.cwd(), process.argv[2]);
    var pathToOutDir = path.join(process.cwd(), "out");
    if (process.argv.length > 3) {
        pathToOutDir = path.join(process.cwd(), process.argv[3]);
    }
    tryMakeDir(pathToOutDir);
    try {
        var test = fs.readdirSync(pathToData);
        console.log(JSON.stringify(test));
        //Get out the config file
        var configFile = test.filter(function (value) { return value == "tcsvconfig.json"; });
        console.assert(configFile.length > 0, "No config file found");
        config = JSON.parse(fs.readFileSync(path.join(pathToData, configFile[0]), "utf8"));
        //prelim data colleciton
        for (var i = 0; i < test.length; i++) {
            var fileName = test[i];
            if (path.extname(fileName) === ".csv") {
                var fileName_1 = test[i];
                var tableName = path.basename(fileName_1, ".csv");
                var tableData = gatherTableData(path.join(pathToData, fileName_1));
                if (tableData != null) {
                    tableDataLookup[tableName] = tableData;
                }
            }
        }
        //adding reference type validators
        for (var tableName in tableDataLookup) {
            var tablesReferenceTypes = generateTablesReferenceTypeingFunctions(tableDataLookup[tableName]);
            validTypes[tableName] = tablesReferenceTypes["*"];
            validTypes["*" + tableName] = tablesReferenceTypes["*"];
            validTypes["^" + tableName] = tablesReferenceTypes["^"];
            validTypes["&" + tableName] = tablesReferenceTypes["&"];
        }
        for (var validTypeName in validTypes) {
            console.log(validTypeName);
        }
        //typing pass
        for (var tableName in tableDataLookup) {
            var typingPass = typeTable(tableDataLookup[tableName]);
            if (typingPass != null) {
                typedTables[tableName] = typingPass;
            }
        }
        //Output pass
        for (var tableName in tableDataLookup) {
            outputTable(tableDataLookup[tableName], typedTables[tableName], pathToOutDir);
        }
    }
    catch (e) {
        console.error(e);
    }
}());
function tryMakeDir(path) {
    try {
        fs.mkdirSync(path);
    }
    catch (e) {
        if (e.code !== "EEXIST") {
            console.error(JSON.stringify(e));
            return;
        }
    }
}
function gatherTableData(filePath) {
    try {
        var data = fs.readFileSync(filePath, 'utf8');
        var parsedCSV = parse(data);
        var tableName_1 = path.basename(filePath, '.csv');
        var normalizedTableName = normalizeTextName(tableName_1);
        var headerRow_1 = [];
        var normalizedPropertyNames_1 = [];
        var primaryColumnIndex_1 = 0;
        var selectedTableFormat_1 = config.tableFormats.hasOwnProperty(tableName_1) ? config.tableFormats[tableName_1] : config.defaultTableFormat;
        if (selectedTableFormat_1 == null) {
            console.error("Failed to find table format for " + tableName_1 + " and no default table format provided");
            return;
        }
        for (var i = 0; i < parsedCSV[0].length; i++) {
            headerRow_1.push({
                propertyName: null,
                propertyType: null,
                propertyDescription: null,
                specialKey: null,
            });
        }
        var _loop_1 = function (rowIndex) {
            parsedCSV[rowIndex].forEach(function (value, columnIndex) {
                var splitHeaderValue = value.split(':');
                for (var cellSplitIndex = 0; cellSplitIndex < selectedTableFormat_1.headerMapping[rowIndex].length; cellSplitIndex++) {
                    if (splitHeaderValue.length > cellSplitIndex) {
                        switch (selectedTableFormat_1.headerMapping[rowIndex][cellSplitIndex]) {
                            case "PropertyName":
                                headerRow_1[columnIndex].propertyName = normalizeTextName(splitHeaderValue[cellSplitIndex]);
                                break;
                            case "PropertyType":
                                headerRow_1[columnIndex].propertyType = splitHeaderValue[cellSplitIndex];
                                break;
                            case "PropertyDescription":
                                headerRow_1[columnIndex].propertyDescription = splitHeaderValue[cellSplitIndex];
                                break;
                            case "SpecialModifer":
                                headerRow_1[columnIndex].specialKey = splitHeaderValue[cellSplitIndex];
                                break;
                        }
                    }
                }
            });
        };
        for (var rowIndex = 0; rowIndex < selectedTableFormat_1.headerMapping.length; rowIndex++) {
            _loop_1(rowIndex);
        }
        //Validate header row info
        headerRow_1.forEach(function (headerRowEntry, index) {
            if (headerRowEntry.propertyName == null) {
                console.error("Exited before completion: " + tableName_1 + "'s column " + index + " does not have a valid property name");
                return;
            }
            if (headerRowEntry.propertyType == null) {
                headerRow_1[index].propertyType = "Any";
            }
            if (headerRowEntry.propertyDescription == null) {
                headerRow_1[index].propertyDescription = "";
            }
            var normalizedPropertyName = headerRowEntry.propertyName;
            if (normalizedPropertyNames_1.indexOf(normalizedPropertyName.join("")) > -1) {
                console.error("Exited before completion: " + tableName_1 + "'s PropertyName(" + headerRow_1[primaryColumnIndex_1].propertyName + ") integrity is compromised duplicate PropertyName found.");
                return;
            }
            else {
                normalizedPropertyNames_1.push(normalizedPropertyName.join(""));
            }
            //Override default primary Column?
            if (headerRowEntry.specialKey == "PrimaryKey") {
                primaryColumnIndex_1 = index;
            }
        });
        return {
            parsedCSV: parsedCSV,
            tableName: tableName_1,
            headerRow: headerRow_1,
            tableFormat: selectedTableFormat_1,
            normalizedPropertyNames: normalizedPropertyNames_1,
            primaryColumnIndex: primaryColumnIndex_1,
        };
    }
    catch (err) {
        if (err != null) {
            switch (err.code) {
                case "ENOENT":
                    console.log("File " + process.argv[2] + " does not exist");
                    break;
                default:
                    console.log(JSON.stringify(err));
                    break;
            }
            return null;
        }
    }
}
function generateTablesReferenceTypeingFunctions(tableData) {
    return {
        "*": function (str) {
            for (var i = tableData.tableFormat.headerMapping.length; i < tableData.parsedCSV.length; i++) {
                if (tableData.parsedCSV[i][tableData.primaryColumnIndex] === str) {
                    return str;
                }
            }
            //TODO: need better information here likely will need to pass more context into typing functions
            console.error("Failed to validate " + str + " as a reference type");
            return null;
        },
        "^": function (str) {
            for (var i = tableData.tableFormat.headerMapping.length; i < tableData.parsedCSV.length; i++) {
                if (tableData.parsedCSV[i][tableData.primaryColumnIndex] === str) {
                    if (typedTables.hasOwnProperty(tableData.tableName) && typedTables[tableData.tableName].hasOwnProperty(str)) {
                        return typedTables[tableData.tableName][str];
                    }
                    else {
                        console.error("^ reference type not fullly supported was unable to pull processed data for " + str);
                        return null;
                    }
                }
            }
            //TODO: need better information here likely will need to pass more context into typing functions
            console.error("Failed to validate " + str + " as a reference type");
            return null;
        },
        "&": function (str) { console.error("& reference type not supported"); return null; },
    };
    // str => {
    //     for(let i=tableData.tableFormat.headerMapping.length; i< tableData.parsedCSV.length; i++)
    //     {
    //         if(tableData.parsedCSV[i][tableData.primaryColumnIndex] === str)
    //         {
    //             return str;
    //         }
    //     }
    //     //TODO: need better information here likely will need to pass more context into typing functions
    //     console.error(`Failed to validate ${str} as a reference type`);
    //     return null;
    // };
}
function typeTable(tableData) {
    var headerMapping = tableData.tableFormat.headerMapping;
    var parsedCSV = tableData.parsedCSV;
    var primaryColumnIndex = tableData.primaryColumnIndex;
    var tableName = tableData.tableName;
    var headerRow = tableData.headerRow;
    var typedTableData = {};
    for (var i = headerMapping.length; i < parsedCSV.length; i++) {
        var entryRow = parsedCSV[i];
        var primaryKeyValue = entryRow[primaryColumnIndex];
        //Confirm integrity of primary key
        if (typedTableData.hasOwnProperty(primaryKeyValue)) {
            console.error("Exited before completion: " + tableName + "'s PrimiaryKey(" + headerRow[primaryColumnIndex].propertyName + ") integrity is compromised duplicate key " + primaryKeyValue + " found on row " + (i + 1) + ".");
            return null;
        }
        typedTableData[primaryKeyValue] = {};
        for (var j = 0; j < headerRow.length; j++) {
            var headerEntry = headerRow[j];
            typedTableData[primaryKeyValue][styleNormalizedName(headerEntry.propertyName, "CamelCase")] = typeEntry(entryRow[j], headerEntry.propertyType);
        }
    }
    return typedTableData;
}
function outputTable(tableData, typedTableData, pathToOutDir) {
    var headerRow = tableData.headerRow;
    var tableName = tableData.tableName;
    var normalizedTableName = normalizeTextName(tableData.tableName);
    var jsonifedTablesOutDir = path.join(pathToOutDir, "json");
    tryMakeDir(jsonifedTablesOutDir);
    fs.writeFile(path.join(jsonifedTablesOutDir, tableName + ".json"), JSON.stringify(typedTableData, null, "\t"), function (err) { if (err !== null)
        console.error(JSON.stringify(err)); });
    var generatedFiles = {};
    for (var genId in config.codeGenerators) {
        if (config.codeGenerators.hasOwnProperty(genId)) {
            var codeGenerator = config.codeGenerators[genId];
            generatedFiles[genId] = config.codeGenerators[genId].objectOpen.replace("{objectName}", styleNormalizedName(normalizedTableName, codeGenerator.objectNameStyling)) + '\n';
        }
    }
    for (var i = 0; i < headerRow.length; i++) {
        var type = headerRow[i].propertyType;
        var name_1 = headerRow[i].propertyName;
        var description = headerRow[i].propertyDescription;
        for (var genId in config.codeGenerators) {
            var codeGenerator = config.codeGenerators[genId];
            if (config.codeGenerators.hasOwnProperty(genId)) {
                generatedFiles[genId] += '\t' + codeGenerator.objectProperty
                    .replace("{propertyType}", mapType(type, codeGenerator, codeGenerator.listType))
                    .replace("{propertyName}", styleNormalizedName(name_1, codeGenerator.objectPropertyNameStyling))
                    .replace("{propertyDescription}", description).replace(/\n/g, "\n\t") +
                    '\n';
            }
        }
    }
    for (var genId in config.codeGenerators) {
        if (config.codeGenerators.hasOwnProperty(genId)) {
            generatedFiles[genId] += config.codeGenerators[genId].objectClose + '\n';
            var generatedCodeOutDir = path.join(pathToOutDir, genId);
            tryMakeDir(generatedCodeOutDir);
            fs.writeFile(path.join(generatedCodeOutDir, (tableName + "{ext}").replace("{ext}", config.codeGenerators[genId].ext)), generatedFiles[genId], function (err) { if (err !== null)
                console.error(JSON.stringify(err)); });
        }
    }
}
function mapType(type, codeGenerator, listType) {
    var typeMapping = codeGenerator.typeMapping;
    var mappedType = "{propertyType}";
    var typeInfo = getBaseTypeAndListLevels(type);
    for (var i = 0; i < typeInfo.listLevels; i++) {
        mappedType = mappedType.replace("{propertyType}", listType);
    }
    //TODO: consider fixing up TypeMapping to be more consistent
    var calculatedTypeMapping = null;
    if (typeMapping.hasOwnProperty(typeInfo.baseType)) {
        calculatedTypeMapping = typeMapping[typeInfo.baseType];
    }
    else if (typeInfo.baseType[0] == "^") {
        calculatedTypeMapping = styleNormalizedName(normalizeTextName(typeInfo.baseType.slice(1)), codeGenerator.objectNameStyling);
    }
    else {
        calculatedTypeMapping = typeMapping["Any"];
    }
    return mappedType.replace("{propertyType}", calculatedTypeMapping);
}
function normalizeTextName(rawPropertyName) {
    return rawPropertyName.replace(/([A-Z][a-z])/g, ' $1') //First normalize the CamelCasing to Camel Casing
        .replace(/_/g, " ") //Then split out the underscore_spacing to underscore spacing
        .split(" ") //then split on spaces
        .map(function (entry) { return entry.toLocaleLowerCase(); }) //remove casing
        .filter(function (entry) { return entry !== ""; }); //remove empty strings
}
function styleNormalizedName(normalizedPropertyName, styling) {
    switch (styling) {
        case "CamelCase":
            return normalizedPropertyName.map(function (word) { return captializeLetterAt(word, 0); }).join("");
        case "camelCase":
            return normalizedPropertyName[0] + normalizedPropertyName.slice(1).map(function (word) { return captializeLetterAt(word, 0); }).join("");
        case "snake_case":
            return normalizedPropertyName.join("_");
        case "SCREAMING_SNAKE_CASE":
            return normalizedPropertyName.map(function (word) { return word.toUpperCase(); }).join("_");
        case "kebab-case":
            return normalizedPropertyName.join("-");
        case "Train-Case":
            return normalizedPropertyName.map(function (word) { return captializeLetterAt(word, 0); }).join("-");
        case "stUdLyCaPs":
            return stUdLyCaPsiT(normalizedPropertyName.join(""));
    }
}
function captializeLetterAt(targetString, targetIndex) {
    return targetString.slice(0, targetIndex) + targetString.charAt(targetIndex).toUpperCase() + targetString.slice(targetIndex + 1);
}
function stUdLyCaPsiT(targetString) {
    for (var i = 0; i < targetString.length; i++) {
        if (Math.random() > .5) {
            targetString = captializeLetterAt(targetString, i);
        }
    }
    return targetString;
}
function typeEntry(val, type) {
    var typeInfo = getBaseTypeAndListLevels(type);
    return typeValue(val, typeInfo.baseType, typeInfo.listLevels);
}
function getBaseTypeAndListLevels(val) {
    var i = 0;
    for (; val.slice(val.length - 2) === "[]"; i++, val = val.slice(0, val.length - 2)) { }
    return {
        listLevels: i,
        baseType: val
    };
}
function typeValue(val, baseType, listLevels) {
    if (listLevels < 1) {
        if (validTypes.hasOwnProperty(baseType)) {
            return validTypes[baseType](val);
        }
        else {
            console.error("Could not find method to process value of type " + baseType);
        }
    }
    else
        return parse(val)[0].map(function (innerVal) { return typeValue(innerVal, baseType, listLevels - 1); });
}
