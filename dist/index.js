"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var fs = require("fs");
var parse = require("csv-parse/lib/sync");
var config = null;
(function () {
    var pathToData = path.join(process.cwd(), process.argv[2]);
    var pathToOutDir = path.join(process.cwd(), "out");
    if (process.argv.length > 3) {
        pathToOutDir = path.join(process.cwd(), process.argv[3]);
    }
    try {
        fs.mkdirSync(pathToOutDir);
    }
    catch (e) {
        if (e.code !== "EEXIST") {
            console.error(JSON.stringify(e));
            return;
        }
    }
    try {
        var test = fs.readdirSync(pathToData);
        console.log(JSON.stringify(test));
        //Get out the config file
        var configFile = test.filter(function (value) { return value == "tcsvconfig.json"; });
        console.assert(configFile.length > 0, "No config file found");
        config = JSON.parse(fs.readFileSync(path.join(pathToData, configFile[0]), "utf8"));
        for (var i = 0; i < test.length; i++) {
            var fileName = test[i];
            if (path.extname(fileName) === ".csv") {
                genTable(path.join(pathToData, fileName), pathToOutDir);
            }
        }
    }
    catch (e) {
        if (e.code === "ENOTDIR")
            genTable(pathToData, pathToOutDir);
        else
            console.error(e);
    }
}());
function genTable(filePath, outPath) {
    fs.readFile(filePath, 'utf8', function (err, data) {
        if (err != null) {
            switch (err.code) {
                case "ENOENT":
                    console.log("File " + process.argv[2] + " does not exist");
                    break;
                default:
                    console.log(JSON.stringify(err));
                    break;
            }
            return;
        }
        var parsedCSV = parse(data);
        var tableName = path.basename(filePath, '.csv');
        var normalizedTableName = normalizeTextName(tableName);
        //TODO: might really need to to a check for conflicting normalized table names
        var headerRow = [];
        var normalizedPropertyNames = [];
        var primaryColumnIndex = 0;
        var selectedTableFormat = config.tableFormats.hasOwnProperty(tableName) ? config.tableFormats[tableName] : config.defaultTableFormat;
        if (selectedTableFormat == null) {
            console.error("Failed to find table format for " + tableName + " and no default table format provided");
            return;
        }
        for (var i = 0; i < parsedCSV[0].length; i++) {
            headerRow.push({
                propertyName: null,
                propertyType: null,
                propertyDescription: null,
                specialKey: null,
            });
        }
        var _loop_1 = function (rowIndex) {
            parsedCSV[rowIndex].forEach(function (value, columnIndex) {
                var splitHeaderValue = value.split(':');
                for (var cellSplitIndex = 0; cellSplitIndex < selectedTableFormat.headerMapping[rowIndex].length; cellSplitIndex++) {
                    if (splitHeaderValue.length > cellSplitIndex) {
                        switch (selectedTableFormat.headerMapping[rowIndex][cellSplitIndex]) {
                            case "PropertyName":
                                headerRow[columnIndex].propertyName = normalizeTextName(splitHeaderValue[cellSplitIndex]);
                                break;
                            case "PropertyType":
                                headerRow[columnIndex].propertyType = splitHeaderValue[cellSplitIndex];
                                break;
                            case "PropertyDescription":
                                headerRow[columnIndex].propertyDescription = splitHeaderValue[cellSplitIndex];
                                break;
                            case "SpecialModifer":
                                headerRow[columnIndex].specialKey = splitHeaderValue[cellSplitIndex];
                                break;
                        }
                    }
                }
            });
        };
        for (var rowIndex = 0; rowIndex < selectedTableFormat.headerMapping.length; rowIndex++) {
            _loop_1(rowIndex);
        }
        //Validate header row info
        headerRow.forEach(function (headerRowEntry, index) {
            if (headerRowEntry.propertyName == null) {
                console.error("Exited before completion: " + tableName + "'s column " + index + " does not have a valid property name");
                return;
            }
            if (headerRowEntry.propertyType == null) {
                headerRow[index].propertyType = "Any";
            }
            if (headerRowEntry.propertyDescription == null) {
                headerRow[index].propertyDescription = "";
            }
            var normalizedPropertyName = headerRowEntry.propertyName;
            if (normalizedPropertyNames.indexOf(normalizedPropertyName.join("")) > -1) {
                console.error("Exited before completion: " + tableName + "'s PropertyName(" + headerRow[primaryColumnIndex].propertyName + ") integrity is compromised duplicate PropertyName found.");
                return;
            }
            else {
                normalizedPropertyNames.push(normalizedPropertyName.join(""));
            }
            //Override default primary Column?
            if (headerRowEntry.specialKey == "PrimaryKey") {
                primaryColumnIndex = index;
            }
        });
        var jsonified = {};
        for (var i = selectedTableFormat.headerMapping.length; i < parsedCSV.length; i++) {
            var entryRow = parsedCSV[i];
            var primaryKeyValue = entryRow[primaryColumnIndex];
            if (jsonified.hasOwnProperty(primaryKeyValue)) {
                console.error("Exited before completion: " + tableName + "'s PrimiaryKey(" + headerRow[primaryColumnIndex].propertyName + ") integrity is compromised duplicate key " + primaryKeyValue + " found on row " + (i + 1) + ".");
                return;
            }
            jsonified[primaryKeyValue] = {};
            for (var j = 0; j < headerRow.length; j++) {
                var headerEntry = headerRow[j];
                jsonified[primaryKeyValue][headerEntry.propertyName.join("_")] = typeEntry(entryRow[j], headerEntry.propertyType);
            }
            fs.writeFile(path.join(outPath, tableName + ".json"), JSON.stringify(jsonified, null, "\t"), function (err) { if (err !== null)
                console.error(JSON.stringify(err)); });
        }
        var generatedFiles = {};
        for (var genId in config.codeGenerators) {
            if (config.codeGenerators.hasOwnProperty(genId)) {
                var codeGenerator = config.codeGenerators[genId];
                generatedFiles[genId] = config.codeGenerators[genId].objectOpen.replace("{objectName}", mapPropertyName(normalizedTableName, codeGenerator.objectNameStyling)) + '\n';
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
                        .replace("{propertyType}", mapType(type, codeGenerator.typeMapping, codeGenerator.listType))
                        .replace("{propertyName}", mapPropertyName(name_1, codeGenerator.objectPropertyNameStyling))
                        .replace("{propertyDescription}", description).replace(/\n/g, "\n\t") +
                        '\n';
                }
            }
        }
        for (var genId in config.codeGenerators) {
            if (config.codeGenerators.hasOwnProperty(genId)) {
                generatedFiles[genId] += config.codeGenerators[genId].objectClose + '\n';
                fs.writeFile(path.join(outPath, (tableName + "{ext}").replace("{ext}", config.codeGenerators[genId].ext)), generatedFiles[genId], function (err) { if (err !== null)
                    console.error(JSON.stringify(err)); });
            }
        }
    });
}
function mapType(type, typeMapping, listType) {
    var mappedType = "{propertyType}";
    var typeInfo = getBaseTypeAndListLevels(type);
    for (var i = 0; i < typeInfo.listLevels; i++) {
        mappedType = mappedType.replace("{propertyType}", listType);
    }
    return mappedType.replace("{propertyType}", typeMapping[typeInfo.baseType]);
}
function normalizeTextName(rawPropertyName) {
    return rawPropertyName.replace(/([A-Z][a-z])/g, ' $1') //First normalize the CamelCasing to Camel Casing
        .replace(/_/g, " ") //Then split out the underscore_spacing to underscore spacing
        .split(" ") //then split on spaces
        .map(function (entry) { return entry.toLocaleLowerCase(); }) //remove casing
        .filter(function (entry) { return entry !== ""; }); //remove empty strings
}
function mapPropertyName(normalizedPropertyName, styling) {
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
function getBaseTypeAndListLevels(val) {
    var i = 0;
    for (; val.slice(val.length - 2) === "[]"; i++, val = val.slice(0, val.length - 2)) { }
    return {
        listLevels: i,
        baseType: val
    };
}
function typeValue(val, baseType, listLevels) {
    if (listLevels < 1)
        return validTypes[baseType](val);
    else
        return parse(val)[0].map(function (innerVal) { return typeValue(innerVal, baseType, listLevels - 1); });
}
