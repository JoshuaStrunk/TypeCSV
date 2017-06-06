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
            console.log("Attempt to convert " + val + " to int failed");
            return null;
        }
    },
    "Float": function (val) {
        var parsedFloat = parseFloat(val);
        if (parsedFloat !== NaN) {
            return parsedFloat;
        }
        else {
            console.log("Attempt to convert " + val + " to float failed");
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
            validTypes[tableName] = generateTablesReferenceTypeingFunction(tableDataLookup[tableName]);
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
        outputUnityImporter("");
    }
    catch (e) {
        console.log(JSON.stringify(e));
    }
}());
function tryMakeDir(path) {
    try {
        fs.mkdirSync(path);
    }
    catch (e) {
        if (e.code !== "EEXIST") {
            console.log(JSON.stringify(e));
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
        var tableInfo = {
            singleEntryObjectName: tableName_1 + "Entry",
            collectionLayout: null,
        };
        var normalizedPropertyNames_1 = [];
        var primaryColumnIndex_1 = 0;
        var selectedTableFormat = config.tableFormats.hasOwnProperty(tableName_1) ? config.tableFormats[tableName_1] : config.defaultTableFormat;
        if (selectedTableFormat == null) {
            console.log("Failed to find table format for " + tableName_1 + " and no default table format provided");
            return null;
        }
        var tableHeaderFormat = selectedTableFormat.headerMapping.tableHeaders;
        for (var i = 0; i < parsedCSV[tableHeaderFormat.length].length; i++) {
            headerRow_1.push({
                propertyName: null,
                propertyType: null,
                propertyDescription: null,
                propertyKeywords: null,
            });
        }
        for (var rowIndex = 0; rowIndex < tableHeaderFormat.length; rowIndex++) {
            for (var columnIndex = 0; columnIndex < tableHeaderFormat[rowIndex].length; columnIndex++) {
                switch (tableHeaderFormat[rowIndex][columnIndex]) {
                    case "SingleEntryObjectName":
                        tableInfo.singleEntryObjectName = parsedCSV[rowIndex][columnIndex];
                        break;
                    case "CollectionLayoutType":
                        //TODO: validate keywords
                        tableInfo.collectionLayout = parsedCSV[rowIndex][columnIndex];
                        break;
                }
            }
        }
        var propertyHeaderFormat_1 = selectedTableFormat.headerMapping.columnHeaders;
        console.log(JSON.stringify(propertyHeaderFormat_1));
        var _loop_1 = function (rowIndex) {
            var propertyHeaderRowIndex = rowIndex - tableHeaderFormat.length;
            parsedCSV[rowIndex].forEach(function (value, columnIndex) {
                try {
                    var splitHeaderValue = value.split(':');
                    for (var cellSplitIndex = 0; cellSplitIndex < propertyHeaderFormat_1[propertyHeaderRowIndex].length; cellSplitIndex++) {
                        if (splitHeaderValue.length > cellSplitIndex) {
                            switch (propertyHeaderFormat_1[propertyHeaderRowIndex][cellSplitIndex]) {
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
                                    headerRow_1[columnIndex].propertyKeywords = splitHeaderValue[cellSplitIndex];
                                    break;
                            }
                        }
                    }
                }
                catch (err) {
                    console.error(err);
                }
            });
        };
        for (var rowIndex = tableHeaderFormat.length; rowIndex < (propertyHeaderFormat_1.length + tableHeaderFormat.length); rowIndex++) {
            _loop_1(rowIndex);
        }
        //Validate header row info
        headerRow_1.forEach(function (headerRowEntry, index) {
            if (headerRowEntry.propertyName == null) {
                console.log("Exited before completion: " + tableName_1 + "'s column " + index + " does not have a valid property name");
                console.log("tests");
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
                console.log("Exited before completion: " + tableName_1 + "'s PropertyName(" + headerRow_1[primaryColumnIndex_1].propertyName + ") integrity is compromised duplicate PropertyName found.");
                return;
            }
            else {
                normalizedPropertyNames_1.push(normalizedPropertyName.join(""));
            }
            //Override default primary Column?
            if (headerRowEntry.propertyKeywords == "PrimaryKey") {
                primaryColumnIndex_1 = index;
            }
        });
        console.log("tests");
        return {
            parsedCSVEntryData: parsedCSV.slice(tableHeaderFormat.length + propertyHeaderFormat_1.length),
            tableInfo: tableInfo,
            tableName: tableName_1,
            headerRow: headerRow_1,
            tableFormat: selectedTableFormat,
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
                    console.error(err);
                    break;
            }
            return null;
        }
        else {
            console.error(err);
        }
    }
}
function generateTablesReferenceTypeingFunction(tableData) {
    return function (str) {
        for (var i = 0; i < tableData.parsedCSVEntryData.length; i++) {
            if (tableData.parsedCSVEntryData[i][tableData.primaryColumnIndex] === str) {
                return str;
            }
        }
        //TODO: need better information here likely will need to pass more context into typing functions
        console.log("Failed to validate " + str + " as a reference type");
        return null;
    };
}
function typeTable(tableData) {
    var tableHeaders = tableData.tableFormat.headerMapping.tableHeaders;
    var columnHeaders = tableData.tableFormat.headerMapping.columnHeaders;
    var parsedCSV = tableData.parsedCSVEntryData;
    var primaryColumnIndex = tableData.primaryColumnIndex;
    var tableName = tableData.tableName;
    var headerRow = tableData.headerRow;
    var typedTableData = {};
    for (var i = 0; i < parsedCSV.length; i++) {
        var entryRow = parsedCSV[i];
        var primaryKeyValue = entryRow[primaryColumnIndex];
        //Confirm integrity of primary key
        if (typedTableData.hasOwnProperty(primaryKeyValue)) {
            console.log("Exited before completion: " + tableName + "'s PrimiaryKey(" + headerRow[primaryColumnIndex].propertyName + ") integrity is compromised duplicate key " + primaryKeyValue + " found on row " + (i + 1) + ".");
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
    try {
        var headerRow = tableData.headerRow;
        var tableName = tableData.tableName;
        var normalizedTableEntryObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);
        var jsonifedTablesOutDir = path.join(pathToOutDir, "json");
        tryMakeDir(jsonifedTablesOutDir);
        fs.writeFile(path.join(jsonifedTablesOutDir, tableName + ".json"), JSON.stringify(typedTableData, null, "\t"), function (err) { if (err !== null)
            console.log(JSON.stringify(err)); });
        var generatedFiles = {};
        for (var genId in config.codeGenerators) {
            if (config.codeGenerators.hasOwnProperty(genId)) {
                var codeGenerator = config.codeGenerators[genId];
                generatedFiles[genId] = config.codeGenerators[genId].objectOpen.replace("{objectName}", styleNormalizedName(normalizedTableEntryObjectName, codeGenerator.objectNameStyling)) + '\n';
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
                        .replace("{propertyType}", rawMapType(type, codeGenerator, codeGenerator.listType))
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
                    console.log(JSON.stringify(err)); });
            }
        }
    }
    catch (err) {
        console.error(err);
    }
}
function outputUnityImporter(pathToOutDir) {
    var mainDataImporterFile = "";
    var codeGenSettings = config.codeGenerators["csharp"];
    mainDataImporterFile += "public static class Data\n{\n";
    for (var tableId in tableDataLookup) {
        var tableData = tableDataLookup[tableId];
        var normalizedObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);
        var normalizedCollectionName = normalizeTextName(tableData.tableName);
        mainDataImporterFile += "\tpublic static ReadOnlyDictionary<" + styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling) + "," + styleNormalizedName(normalizedObjectName, codeGenSettings.objectNameStyling) + "> " + styleNormalizedName(normalizedCollectionName, codeGenSettings.objectPropertyNameStyling) + " { get; private set; };\n";
    }
    mainDataImporterFile += "\n\tpublic static Load(Dictionary<string,string> dataSource)\n\t{\n";
    for (var tableId in tableDataLookup) {
        var tableData = tableDataLookup[tableId];
        var normalizedObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);
        var normalizedCollectionName = normalizeTextName(tableData.tableName);
        var objectName = styleNormalizedName(normalizedObjectName, codeGenSettings.objectNameStyling);
        mainDataImporterFile += "\t\t" + styleNormalizedName(normalizedCollectionName, codeGenSettings.objectPropertyNameStyling) + " = new ReadOnlyDictionary(JsonConvert.DeserializeObject<Dictionary<" + styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling) + "," + objectName + ".Raw>>(dataSource[\"" + styleNormalizedName(normalizedCollectionName, codeGenSettings.objectNameStyling) + "\"]).ToDictionary(keyValuePair => keyValuePair.Key, new" + objectName + "(keyValuePair => keyValuePair.Value)));\n";
    }
    mainDataImporterFile += "\t}\n";
    mainDataImporterFile += "\n";
    for (var tableId in tableDataLookup) {
        var tableData = tableDataLookup[tableId];
        var normalizedObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);
        var normalizedCollectionName = normalizeTextName(tableData.tableName);
        mainDataImporterFile += "\tpublic enum " + styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling) + "\n\t{\n";
        for (var i = 0; i < tableData.parsedCSVEntryData.length; i++) {
            mainDataImporterFile += "\t\t" + styleNormalizedName(normalizeTextName(tableData.parsedCSVEntryData[i][tableData.primaryColumnIndex]), "CamelCase") + (i == tableData.parsedCSVEntryData.length - 1 ? "" : ",") + "\n";
        }
        mainDataImporterFile += "\t};\n";
    }
    mainDataImporterFile += "\n";
    for (var entryId in tableDataLookup) {
        var tableData = tableDataLookup[entryId];
        var headerRow = tableData.headerRow;
        var normalizedObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);
        mainDataImporterFile += "\t[JsonObject(MemberSerialization.OptIn)]\n";
        mainDataImporterFile += "\tprivate struct " + styleNormalizedName(normalizedObjectName, codeGenSettings.objectNameStyling) + "\n\t{\n";
        for (var i = 0; i < headerRow.length; i++) {
            var type = headerRow[i].propertyType;
            var name_2 = headerRow[i].propertyName;
            var description = headerRow[i].propertyDescription;
            if (description != null && description != "") {
                mainDataImporterFile += "\t\t/// <summary>" + description + "\n";
            }
            if (tableData.primaryColumnIndex == i) {
                mainDataImporterFile += "\t\tpublic " + styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling) + " " + styleNormalizedName(name_2, codeGenSettings.objectPropertyNameStyling) + " { get{ return rawData." + styleNormalizedName(name_2, codeGenSettings.objectPropertyNameStyling) + "; } }\n";
            }
            else if (isTableReferenceType(type, codeGenSettings)) {
                mainDataImporterFile += "\t\tpublic " + referenceMapType(type, codeGenSettings, codeGenSettings.listType) + " " + styleNormalizedName(name_2, codeGenSettings.objectPropertyNameStyling) + " { get{ return Data." + styleNormalizedName(normalizeTextName(type), codeGenSettings.objectPropertyNameStyling) + "[rawData." + styleNormalizedName(name_2, codeGenSettings.objectPropertyNameStyling) + "]; } }\n";
            }
            else {
                mainDataImporterFile += "\t\tpublic " + referenceMapType(type, codeGenSettings, codeGenSettings.listType) + " " + styleNormalizedName(name_2, codeGenSettings.objectPropertyNameStyling) + " { get{ return rawData." + styleNormalizedName(name_2, codeGenSettings.objectPropertyNameStyling) + "; } }\n";
            }
            mainDataImporterFile += "\n";
        }
        mainDataImporterFile += "\t\t[JsonProperty]\n";
        mainDataImporterFile += "\t\tprivate Raw rawData;\n";
        mainDataImporterFile += "\t\tpublic struct Raw\n\t\t{\n";
        for (var i = 0; i < headerRow.length; i++) {
            var type = headerRow[i].propertyType;
            var name_3 = headerRow[i].propertyName;
            var description = headerRow[i].propertyDescription;
            if (tableData.primaryColumnIndex == i) {
                mainDataImporterFile += "\t\t\tpublic " + styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling) + " " + styleNormalizedName(name_3, codeGenSettings.objectPropertyNameStyling) + ";\n";
            }
            else {
                mainDataImporterFile += '\t\t\tpublic {propertyType} {propertyName};'
                    .replace("{propertyType}", rawMapType(type, codeGenSettings, codeGenSettings.listType))
                    .replace("{propertyName}", styleNormalizedName(name_3, codeGenSettings.objectPropertyNameStyling))
                    .replace("{propertyDescription}", description).replace(/\n/g, "\n\t\t\t") +
                    '\n';
            }
        }
        mainDataImporterFile += "\t\t}\n";
        mainDataImporterFile += "\t}\n";
    }
    mainDataImporterFile += "}";
    console.log(mainDataImporterFile);
}
function rawMapType(type, codeGenerator, listType) {
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
    else {
        calculatedTypeMapping = styleNormalizedName(normalizeTextName(tableDataLookup[typeInfo.baseType].tableInfo.singleEntryObjectName).concat(["id"]), "CamelCase"); //typeMapping["Any"];
    }
    return mappedType.replace("{propertyType}", calculatedTypeMapping);
}
function referenceMapType(type, codeGenerator, listType) {
    try {
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
        else {
            var objectName = tableDataLookup[typeInfo.baseType].tableInfo.singleEntryObjectName;
            calculatedTypeMapping = styleNormalizedName(normalizeTextName(objectName), codeGenerator.objectNameStyling);
        }
        return mappedType.replace("{propertyType}", calculatedTypeMapping);
    }
    catch (err) {
        console.error(err);
    }
}
function isTableReferenceType(type, codeGenerator) {
    return !codeGenerator.typeMapping.hasOwnProperty(getBaseTypeAndListLevels(type).baseType);
}
function normalizeTextName(rawPropertyName) {
    try {
        return rawPropertyName.replace(/([A-Z][a-z])/g, ' $1') //First normalize the CamelCasing to Camel Casing
            .replace(/_/g, " ") //Then split out the underscore_spacing to underscore spacing
            .split(" ") //then split on spaces
            .map(function (entry) { return entry.toLocaleLowerCase(); }) //remove casing
            .filter(function (entry) { return entry !== ""; }); //remove empty strings
    }
    catch (err) {
        console.log(JSON.stringify(err));
    }
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
            console.log("Could not find method to process value of type " + baseType);
        }
    }
    else
        return parse(val)[0].map(function (innerVal) { return typeValue(innerVal, baseType, listLevels - 1); });
}
