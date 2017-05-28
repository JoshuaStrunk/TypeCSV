import * as path from "path";
import * as fs from "fs";

import * as parse from "csv-parse/lib/sync";


let config : tscvConfigEntry = null;

let tableDataLookup : {[key:string]: CollectedTableData} = {};
let typedTables : {[key:string]:{[primaryKey:string] : any}} = {};

let validTypes = {
    "Any":        (val:string) => val,
    "String":     (val:string) => val,

    "Int":        (val:string) => {
        let parsedInt = parseInt(val);
        if(parsedInt !== NaN && parsedInt === parseFloat(val))
        {
            return parsedInt;
        }
        else 
        {
            console.error(`Attempt to convert ${val} to int failed`);
            return null;
        }
    },
    "Float":      (val:string) => {
        let parsedFloat = parseFloat(val);
        if(parsedFloat !== NaN)
        {
            return parsedFloat;
        }
        else 
        {
            console.error(`Attempt to convert ${val} to float failed`);
            return null;
        }
    }
};


(function() {


    let pathToData = path.join(process.cwd(), process.argv[2]);
    let pathToOutDir = path.join(process.cwd(), "out");
    if(process.argv.length > 3) 
    {
        pathToOutDir = path.join(process.cwd(), process.argv[3]);
    }

    tryMakeDir(pathToOutDir);

    try
    {
        let test = fs.readdirSync(pathToData);
        console.log(JSON.stringify(test));

        //Get out the config file
        let configFile = test.filter( value => value == "tcsvconfig.json" );
        console.assert(configFile.length>0, "No config file found");
        config = JSON.parse(fs.readFileSync(path.join(pathToData, configFile[0]),"utf8" ));


        //prelim data colleciton
        for(let i=0; i<test.length; i++) 
        {
            let fileName = test[i];

            if(path.extname(fileName) === ".csv")
            {
                let fileName = test[i];
                let tableName = path.basename(fileName, ".csv");
                let tableData = gatherTableData(path.join(pathToData, fileName));
                if(tableData != null)
                {
                    tableDataLookup[tableName] = tableData;
                }
            }
        }

        //adding reference type validators
        for(let tableName in tableDataLookup)
        {
            let tablesReferenceTypes = generateTablesReferenceTypeingFunctions(tableDataLookup[tableName]);
            validTypes[tableName] = tablesReferenceTypes["*"];
            validTypes["*"+tableName] = tablesReferenceTypes["*"];
            validTypes["^"+tableName] = tablesReferenceTypes["^"];
            validTypes["&"+tableName] = tablesReferenceTypes["&"];
        }
        for(let validTypeName in validTypes) {
            console.log(validTypeName);
        }

        //typing pass
        for(let tableName in tableDataLookup)
        {
            
            let typingPass = typeTable(tableDataLookup[tableName]);
            if(typingPass != null)
            {
                typedTables[tableName] = typingPass;
            }
        }

        //Output pass
        for(let tableName in tableDataLookup)
        {
            outputTable(tableDataLookup[tableName], typedTables[tableName], pathToOutDir);
        }

    }
    catch(e) 
    {
        console.error(e);
    }


}())

function tryMakeDir(path:string)
{
    try {
        fs.mkdirSync(path);
    }
    catch(e) {
        if(e.code !== "EEXIST") {
            console.error(JSON.stringify(e));
            return;
        }
    }
}


function gatherTableData(filePath:string):CollectedTableData
{
    try 
    {
        let data = fs.readFileSync(filePath, 'utf8');
        let parsedCSV : string[][] = parse(data);
        let tableName  = path.basename(filePath, '.csv');
        let normalizedTableName = normalizeTextName(tableName);


        let headerRow:HeaderRowEntry[] = [];
        let normalizedPropertyNames:string[] = [];
        let primaryColumnIndex = 0;

        let selectedTableFormat = config.tableFormats.hasOwnProperty(tableName) ? config.tableFormats[tableName] : config.defaultTableFormat;
        if(selectedTableFormat == null)
        {
            console.error(`Failed to find table format for ${tableName} and no default table format provided`);
            return;
        }

        for(let i=0; i<parsedCSV[0].length; i++)
        {
            headerRow.push({
                propertyName: null,
                propertyType: null,
                propertyDescription: null,
                specialKey: null,
            })
        }

        for(let rowIndex=0; rowIndex<selectedTableFormat.headerMapping.length; rowIndex++)
        {
            parsedCSV[rowIndex].forEach((value, columnIndex) => {
                let splitHeaderValue = value.split(':');
                for(let cellSplitIndex=0; cellSplitIndex< selectedTableFormat.headerMapping[rowIndex].length; cellSplitIndex++)
                {
                    if(splitHeaderValue.length > cellSplitIndex)
                    {
                        switch(selectedTableFormat.headerMapping[rowIndex][cellSplitIndex])
                        {
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
            }
            //Validate header row info
            headerRow.forEach((headerRowEntry, index) => {

            if(headerRowEntry.propertyName == null)
            {
                console.error(`Exited before completion: ${tableName}'s column ${index} does not have a valid property name`);
                return;
            }

            if(headerRowEntry.propertyType == null)
            {
                headerRow[index].propertyType = "Any";
            }
            if(headerRowEntry.propertyDescription == null)
            {
                headerRow[index].propertyDescription = "";                
            }

            let normalizedPropertyName = headerRowEntry.propertyName;
            if(normalizedPropertyNames.indexOf(normalizedPropertyName.join("")) > -1  )
            {
                console.error(`Exited before completion: ${tableName}'s PropertyName(${headerRow[primaryColumnIndex].propertyName}) integrity is compromised duplicate PropertyName found.`);
                return;
            }
            else
            {
                normalizedPropertyNames.push(normalizedPropertyName.join(""));
            }

            //Override default primary Column?
            if(headerRowEntry.specialKey == "PrimaryKey") {
                primaryColumnIndex = index;
            }
        });
        return {
            parsedCSV: parsedCSV,
            tableName: tableName,
            headerRow: headerRow,
            tableFormat: selectedTableFormat,
            normalizedPropertyNames: normalizedPropertyNames,
            primaryColumnIndex: primaryColumnIndex,
        };
    } 
    catch(err)
    {
        if(err != null) {
            switch(err.code) {
                case "ENOENT": console.log(`File ${process.argv[2]} does not exist`); break;
                default: console.log(JSON.stringify(err)); break;
            }
            return null;
        }
    }
}

function generateTablesReferenceTypeingFunctions(tableData:CollectedTableData) : TableReferencePrefixTypingFunctions
{



    return {
        "*": str => {
                for(let i=tableData.tableFormat.headerMapping.length; i< tableData.parsedCSV.length; i++)
                {
                    if(tableData.parsedCSV[i][tableData.primaryColumnIndex] === str)
                    {
                        return str;
                    }
                }
                //TODO: need better information here likely will need to pass more context into typing functions
                console.error(`Failed to validate ${str} as a reference type`);
                return null;
            },
        "^": str => { 
            for(let i=tableData.tableFormat.headerMapping.length; i< tableData.parsedCSV.length; i++)
                {
                    if(tableData.parsedCSV[i][tableData.primaryColumnIndex] === str)
                    {
                        if(typedTables.hasOwnProperty(tableData.tableName) && typedTables[tableData.tableName].hasOwnProperty(str))
                        {
                            return typedTables[tableData.tableName][str];
                        }
                        else
                        {
                            console.error(`^ reference type not fullly supported was unable to pull processed data for ${str}`);
                            return null;
                        }
                    }
                }

            //TODO: need better information here likely will need to pass more context into typing functions
            console.error(`Failed to validate ${str} as a reference type`); 
            return null;
        },
        "&": str => { console.error(`& reference type not supported`);  return null;},
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

function typeTable(tableData:CollectedTableData):{[primaryKey:string] : any}
{

    const headerMapping = tableData.tableFormat.headerMapping;
    const parsedCSV = tableData.parsedCSV;
    const primaryColumnIndex = tableData.primaryColumnIndex;
    const tableName = tableData.tableName;
    const headerRow = tableData.headerRow;

    let typedTableData:{[primaryKey:string] : any} = {};
    for(let i = headerMapping.length; i<parsedCSV.length; i++) {
        let entryRow = parsedCSV[i];
        let primaryKeyValue = entryRow[primaryColumnIndex];

        //Confirm integrity of primary key
        if(typedTableData.hasOwnProperty(primaryKeyValue)) {
            console.error(`Exited before completion: ${tableName}'s PrimiaryKey(${headerRow[primaryColumnIndex].propertyName}) integrity is compromised duplicate key ${primaryKeyValue} found on row ${i+1}.`);
            return null;
        }

        typedTableData[primaryKeyValue] = {};
        for(let j=0; j<headerRow.length; j++) {
            let headerEntry = headerRow[j];
            typedTableData[primaryKeyValue][styleNormalizedName(headerEntry.propertyName, "CamelCase")] = typeEntry(entryRow[j], headerEntry.propertyType);
        }
    }

    return typedTableData;
}

function outputTable(tableData:CollectedTableData, typedTableData:{[primaryKey:string] : any}, pathToOutDir:string)
{
    const headerRow = tableData.headerRow;
    const tableName = tableData.tableName;
    const normalizedTableName = normalizeTextName(tableData.tableName);


    let jsonifedTablesOutDir = path.join(pathToOutDir, "json");
    tryMakeDir(jsonifedTablesOutDir);
    fs.writeFile(
            path.join(jsonifedTablesOutDir, `${tableName}.json`), 
            JSON.stringify(typedTableData, null, "\t"), 
            (err) => { if(err !== null) console.error(JSON.stringify(err)); }
        );

    let generatedFiles: {[key:string]: string} = {}

    for(let genId in config.codeGenerators) {
        if(config.codeGenerators.hasOwnProperty(genId))
        {
            let codeGenerator = config.codeGenerators[genId];
            generatedFiles[genId] = config.codeGenerators[genId].objectOpen.replace("{objectName}",  styleNormalizedName(normalizedTableName, codeGenerator.objectNameStyling))+'\n';
        }
    }

    for(let i=0; i<headerRow.length;i++) {
        let type = headerRow[i].propertyType;
        let name = headerRow[i].propertyName;
        let description = headerRow[i].propertyDescription;

        for(let genId in config.codeGenerators) {
            let codeGenerator = config.codeGenerators[genId];
            if(config.codeGenerators.hasOwnProperty(genId))
            {
                generatedFiles[genId] += '\t' + codeGenerator.objectProperty
                    .replace("{propertyType}",  mapType(type, codeGenerator, codeGenerator.listType))
                    .replace("{propertyName}",  styleNormalizedName(name, codeGenerator.objectPropertyNameStyling))
                    .replace("{propertyDescription}", description).replace(/\n/g, "\n\t") +
                    '\n';
            }
        }
    }
    for(let genId in config.codeGenerators) {
        if(config.codeGenerators.hasOwnProperty(genId))
        {
            generatedFiles[genId] += config.codeGenerators[genId].objectClose+'\n';
            let generatedCodeOutDir = path.join(pathToOutDir, genId);
            tryMakeDir(generatedCodeOutDir);
                fs.writeFile(
                path.join(generatedCodeOutDir, `${tableName}{ext}`.replace("{ext}", config.codeGenerators[genId].ext)), 
                generatedFiles[genId], 
                (err) => { if(err !== null) console.error(JSON.stringify(err)); }
            );
        }
    }
}


function mapType(type:string, codeGenerator:ConfigCodeGeneratorEntry, listType:string) :string
{

    const typeMapping = codeGenerator.typeMapping;

    let mappedType = "{propertyType}";
    let typeInfo = getBaseTypeAndListLevels(type);
    for(let i=0; i<typeInfo.listLevels; i++) {
        mappedType = mappedType.replace("{propertyType}", listType);
    }
    //TODO: consider fixing up TypeMapping to be more consistent

    let calculatedTypeMapping = null;
    if(typeMapping.hasOwnProperty(typeInfo.baseType))
    {
        calculatedTypeMapping = typeMapping[typeInfo.baseType];
    }
    else if(typeInfo.baseType[0] == "^")
    {
        calculatedTypeMapping = styleNormalizedName(normalizeTextName(typeInfo.baseType.slice(1)), codeGenerator.objectNameStyling);
    }
    else
    {
        calculatedTypeMapping = typeMapping["Any"];
    }

    return mappedType.replace("{propertyType}", calculatedTypeMapping);
    
    
}

function normalizeTextName(rawPropertyName:string):string[]
{
    return rawPropertyName.replace(/([A-Z][a-z])/g, ' $1') //First normalize the CamelCasing to Camel Casing
    .replace(/_/g, " ")//Then split out the underscore_spacing to underscore spacing
    .split(" ") //then split on spaces
    .map(entry => entry.toLocaleLowerCase()) //remove casing
    .filter(entry => entry !== ""); //remove empty strings
}

type CaseStyling = "CamelCase" | "camelCase" | "snake_case" | "SCREAMING_SNAKE_CASE" | "kebab-case" | "Train-Case" | "stUdLyCaPs";

type PropertyKeywords = "PropertyName" | "PropertyType" | "PropertyDescription" | "SpecialModifer";

function styleNormalizedName(normalizedPropertyName:string[], styling:CaseStyling):string
{
    switch(styling)
    {
        case "CamelCase":
        return normalizedPropertyName.map(word => captializeLetterAt(word, 0)).join("");

        case "camelCase" :
        return normalizedPropertyName[0] + normalizedPropertyName.slice(1).map(word => captializeLetterAt(word, 0)).join("");

        case "snake_case" :
        return normalizedPropertyName.join("_");

        case "SCREAMING_SNAKE_CASE" :
        return normalizedPropertyName.map(word => word.toUpperCase()).join("_");

        case "kebab-case" :
        return normalizedPropertyName.join("-");

        case "Train-Case" :
        return normalizedPropertyName.map(word => captializeLetterAt(word, 0)).join("-");

        case "stUdLyCaPs":
        return  stUdLyCaPsiT(normalizedPropertyName.join(""));
    }
}

function captializeLetterAt(targetString:string, targetIndex:number)
{
    return  targetString.slice(0,targetIndex)+targetString.charAt(targetIndex).toUpperCase() + targetString.slice(targetIndex+1);
}

function stUdLyCaPsiT(targetString:string):string
{
    for(let i=0; i<targetString.length;i++)
    {
        if(Math.random() > .5)
        {
            targetString = captializeLetterAt(targetString, i);
        }
    }

    return targetString;
}



function typeEntry(val:string, type:string)
{
    let typeInfo = getBaseTypeAndListLevels(type);
    return typeValue(val, typeInfo.baseType, typeInfo.listLevels);
}

function getBaseTypeAndListLevels(val:string)
{
    let i=0;
    for(;val.slice(val.length-2) === "[]"; i++, val= val.slice(0,val.length-2)) { }
   
    return {
        listLevels: i,
        baseType: val
    };
}

function typeValue(val:string, baseType:string, listLevels:number)
{
    if(listLevels < 1)
    {
        if(validTypes.hasOwnProperty(baseType))
        {
            return validTypes[baseType](val);
        }
        else 
        {
             console.error(`Could not find method to process value of type ${baseType}`);
        }
    }
    else return parse(val)[0].map((innerVal) => typeValue(innerVal, baseType, listLevels-1));
}


interface tscvConfigEntry
{
    codeGenerators: {[generatorName:string]: ConfigCodeGeneratorEntry};
    tableFormats: {[tableName:string]: ConfigTableFormatEntry};
    defaultTableFormat: ConfigTableFormatEntry;
}

interface ConfigCodeGeneratorEntry
{
    ext:string;
    objectNameStyling:CaseStyling;
    objectOpen:string;
    objectClose:string;
    objectProperty:string;
    objectPropertyNameStyling:CaseStyling;
    typeMapping: TypeMapping;
    listType:string;
}

interface ConfigTableFormatEntry
{
    headerMapping:PropertyKeywords[][];
}

interface TypeMapping
{
    Any: string;
    String: string;
    Int: string;
    Float: string;
}

interface HeaderRowEntry
{ 
    propertyName:string[]; 
    propertyType:string;
    propertyDescription:string;
    specialKey:string;
}

interface TableData
{
    parsedCSV : string[][];
    tableName:string;
    normalizedTableName:string[];
    headerRow:HeaderRowEntry[];
    normalizedPropertyNames:string[];
    primaryColumnIndex:number;
    typedTable: any[][];
}

interface CollectedTableData
{
    parsedCSV:string[][],
    tableName:string;
    tableFormat:ConfigTableFormatEntry;
    headerRow:HeaderRowEntry[];
    normalizedPropertyNames:string[];
    primaryColumnIndex:number;
}

interface TableReferencePrefixTypingFunctions 
{   
    /** Will only store the string key which identifies the table this belongs to */
    "*": (type:string) => string;
    /** Will create a copy of the local table into this objects JSON stack*/
    "^": (type:string) => {[key:string]:any};
    /** Will store a string reference into the outputed data files but when for TypeCSV importers it will map the reference at runtime */
    "&": (type:string) => string;
}