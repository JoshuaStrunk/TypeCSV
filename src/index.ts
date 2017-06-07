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
            console.log(`Attempt to convert ${val} to int failed`);
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
            console.log(`Attempt to convert ${val} to float failed`);
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
            validTypes[tableName] = generateTablesReferenceTypeingFunction(tableDataLookup[tableName]);
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

        outputUnityImporter(pathToOutDir);

    }
    catch(e) 
    {
        console.log(JSON.stringify(e));
    }


}())

function tryMakeDir(path:string)
{
    try {
        fs.mkdirSync(path);
    }
    catch(e) {
        if(e.code !== "EEXIST") {
            console.log(JSON.stringify(e));
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


        let headerRow:PropertyInfo[] = [];
        let tableInfo:TableInfo = {
            singleEntryObjectName: tableName+"Entry",
            collectionLayout: null,
        }
        let normalizedPropertyNames:string[] = [];
        let primaryColumnIndex = 0;

        let selectedTableFormat = config.tableFormats.hasOwnProperty(tableName) ? config.tableFormats[tableName] : config.defaultTableFormat;
        if(selectedTableFormat == null)
        {
            console.log(`Failed to find table format for ${tableName} and no default table format provided`);
            return null;
        }


        let tableHeaderFormat = selectedTableFormat.headerMapping.tableHeaders;
        for(let i=0; i<parsedCSV[tableHeaderFormat.length].length; i++)
        {
            headerRow.push({
                propertyName: null,
                propertyType: null,
                propertyDescription: null,
                propertyKeywords: null,
            })
        }


        for(let rowIndex=0; rowIndex < tableHeaderFormat.length; rowIndex++)
        {
            for(let columnIndex=0; columnIndex < tableHeaderFormat[rowIndex].length; columnIndex++)
            {
                switch(tableHeaderFormat[rowIndex][columnIndex])
                {
                    case "SingleEntryObjectName":
                        tableInfo.singleEntryObjectName = parsedCSV[rowIndex][columnIndex];
                        break;

                    case "CollectionLayoutType":
                        //TODO: validate keywords
                        tableInfo.collectionLayout = <CollectionLayoutType>parsedCSV[rowIndex][columnIndex];
                        break;
                }
            }
        }

        let propertyHeaderFormat = selectedTableFormat.headerMapping.columnHeaders;
        console.log(JSON.stringify(propertyHeaderFormat));
        for(let rowIndex=tableHeaderFormat.length; rowIndex<(propertyHeaderFormat.length+tableHeaderFormat.length); rowIndex++)
        {
            let propertyHeaderRowIndex = rowIndex - tableHeaderFormat.length;
            parsedCSV[rowIndex].forEach((value, columnIndex) => {
                try {
                    let splitHeaderValue = value.split(':');
                    for(let cellSplitIndex=0; cellSplitIndex< propertyHeaderFormat[propertyHeaderRowIndex].length; cellSplitIndex++)
                    {
                        if(splitHeaderValue.length > cellSplitIndex)
                        {
                            switch(propertyHeaderFormat[propertyHeaderRowIndex][cellSplitIndex])
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
                                    headerRow[columnIndex].propertyKeywords = <PropertyKeywords>splitHeaderValue[cellSplitIndex];
                                    break;

                            }
                        }
                    }
                }
                catch(err) {
                    console.error(err);
                }
            });
        }
        
        //Validate header row info
        headerRow.forEach((headerRowEntry, index) => {

            if(headerRowEntry.propertyName == null)
            {
                console.log(`Exited before completion: ${tableName}'s column ${index} does not have a valid property name`);
                console.log("tests");
                
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
                console.log(`Exited before completion: ${tableName}'s PropertyName(${headerRow[primaryColumnIndex].propertyName}) integrity is compromised duplicate PropertyName found.`);
                return;
            }
            else
            {
                normalizedPropertyNames.push(normalizedPropertyName.join(""));
            }

            //Override default primary Column?
            if(headerRowEntry.propertyKeywords == "PrimaryKey") {
                primaryColumnIndex = index;
            }
        });

        console.log("tests");
        
        return {
            parsedCSVEntryData: parsedCSV.slice(tableHeaderFormat.length+propertyHeaderFormat.length),

            tableInfo: tableInfo,

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
                default: console.error(err); break;
            }
            return null;
        }
        else
        {
            console.error(err)
        }
    }
}

function generateTablesReferenceTypeingFunction(tableData:CollectedTableData) : (type:string) => string
{
    return  str => {
                for(let i=0; i< tableData.parsedCSVEntryData.length; i++)
                {
                    if(tableData.parsedCSVEntryData[i][tableData.primaryColumnIndex] === str)
                    {
                        return str;
                    }
                }
                //TODO: need better information here likely will need to pass more context into typing functions
                console.log(`Failed to validate ${str} as a reference type`);
                return null;
            };
}

function typeTable(tableData:CollectedTableData):{[primaryKey:string] : any}
{

    const tableHeaders = tableData.tableFormat.headerMapping.tableHeaders;
    const columnHeaders = tableData.tableFormat.headerMapping.columnHeaders;
    const parsedCSV = tableData.parsedCSVEntryData;
    const primaryColumnIndex = tableData.primaryColumnIndex;
    const tableName = tableData.tableName;
    const headerRow = tableData.headerRow;

    let typedTableData:{[primaryKey:string] : any} = {};
    for(let i = 0; i<parsedCSV.length; i++) {
        let entryRow = parsedCSV[i];
        let primaryKeyValue = entryRow[primaryColumnIndex];

        //Confirm integrity of primary key
        if(typedTableData.hasOwnProperty(primaryKeyValue)) {
            console.log(`Exited before completion: ${tableName}'s PrimiaryKey(${headerRow[primaryColumnIndex].propertyName}) integrity is compromised duplicate key ${primaryKeyValue} found on row ${i+1}.`);
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
    try
    {
        const headerRow = tableData.headerRow;
        const tableName = tableData.tableName;
        const normalizedTableEntryObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);


        let jsonifedTablesOutDir = path.join(pathToOutDir, "json");
        tryMakeDir(jsonifedTablesOutDir);
        fs.writeFile(
                path.join(jsonifedTablesOutDir, `${tableName}.json`), 
                JSON.stringify(typedTableData, null, "\t"), 
                (err) => { if(err !== null) console.log(JSON.stringify(err)); }
            );

        let generatedFiles: {[key:string]: string} = {}

        for(let genId in config.codeGenerators) {
            if(config.codeGenerators.hasOwnProperty(genId))
            {
                let codeGenerator = config.codeGenerators[genId];
                generatedFiles[genId] = config.codeGenerators[genId].objectOpen.replace("{objectName}",  styleNormalizedName(normalizedTableEntryObjectName, codeGenerator.objectNameStyling))+'\n';
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
                        .replace("{propertyType}",  rawMapType(type, codeGenerator, codeGenerator.listType))
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
                    (err) => { if(err !== null) console.log(JSON.stringify(err)); }
                );
            }
        }

    }
    catch(err)
    {
        console.error(err);
    }
}


function outputUnityImporter(pathToOutDir:string)
{

    let mainDataImporterFile:string = "";
    let codeGenSettings = config.codeGenerators["csharp"];

    mainDataImporterFile += "using System.Collections.Generic;\n" +
                            "using System.Linq;\n" +
                            "using Newtonsoft.Json;\n\n"

    mainDataImporterFile += "public static class GameData\n{\n";

    for(let tableId in tableDataLookup)
    {
        let tableData = tableDataLookup[tableId];
        let normalizedObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);
        let normalizedCollectionName = normalizeTextName(tableData.tableName);

        mainDataImporterFile +=`\tpublic static Dictionary<${styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling)},${styleNormalizedName(normalizedObjectName, codeGenSettings.objectNameStyling)}> ${styleNormalizedName(normalizedCollectionName, codeGenSettings.objectPropertyNameStyling)} { get; private set; }\n`
    }

    mainDataImporterFile += `\n\tpublic static void Load(Dictionary<string,string> dataSource)\n\t{\n`
    for(let tableId in tableDataLookup)
    {
        let tableData = tableDataLookup[tableId];
        let normalizedObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);
        let normalizedCollectionName = normalizeTextName(tableData.tableName);

        let objectName = styleNormalizedName(normalizedObjectName, codeGenSettings.objectNameStyling);

        mainDataImporterFile +=`\t\t${styleNormalizedName(normalizedCollectionName, codeGenSettings.objectPropertyNameStyling)} = JsonConvert.DeserializeObject<Dictionary<${styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling)},${objectName}.Raw>>(dataSource["${styleNormalizedName(normalizedCollectionName, codeGenSettings.objectNameStyling)}"]).ToDictionary(keyValuePair => keyValuePair.Key, keyValuePair => new ${objectName}(keyValuePair.Value));\n`
    }
    mainDataImporterFile += `\t}\n`;


    mainDataImporterFile += `\n\tpublic static void Load()\n\t{\n`
    mainDataImporterFile += `\n\t\tLoad(JsonConvert.DeserializeObject<Dictionary<string,string>>((UnityEngine.Resources.Load("GameData") as UnityEngine.TextAsset).text));\n`    
    mainDataImporterFile += `\t}\n`;
    

    mainDataImporterFile += "\n"
    for(let tableId in tableDataLookup)
    {
        let tableData = tableDataLookup[tableId];
        let normalizedObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);
        let normalizedCollectionName = normalizeTextName(tableData.tableName);

        mainDataImporterFile +=`\tpublic enum ${styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling)}\n\t{\n`
        for(let i=0; i<tableData.parsedCSVEntryData.length; i++)
        {
            mainDataImporterFile +=`\t\t${ styleNormalizedName(normalizeTextName(tableData.parsedCSVEntryData[i][tableData.primaryColumnIndex]), "CamelCase")}${i==tableData.parsedCSVEntryData.length-1?"":","}\n` 
        }
        mainDataImporterFile += `\t};\n`
    }
    mainDataImporterFile += "\n"
    for(let entryId in tableDataLookup)
    {
        let tableData = tableDataLookup[entryId];
        let headerRow = tableData.headerRow;
        
        let normalizedObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);
        mainDataImporterFile += "\t[JsonObject(MemberSerialization.OptIn)]\n"
        mainDataImporterFile += `\public struct ${styleNormalizedName(normalizedObjectName, codeGenSettings.objectNameStyling)}\n\t{\n`
        for(let i=0; i<headerRow.length;i++) {
            let type = headerRow[i].propertyType;
            let name = headerRow[i].propertyName;
            let description = headerRow[i].propertyDescription;
            if(description != null && description != "")
            {
                mainDataImporterFile += `\t\t/// <summary>${description}\n`;
            }

            if(tableData.primaryColumnIndex == i )
            {
                mainDataImporterFile += `\t\tpublic ${styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling)} ${styleNormalizedName(name, codeGenSettings.objectPropertyNameStyling)} { get{ return rawData.${styleNormalizedName(name, codeGenSettings.objectPropertyNameStyling)}; } }\n`
            }
            else if(isTableReferenceType(type, codeGenSettings))
            {
                mainDataImporterFile += `\t\tpublic ${referenceMapType(type, codeGenSettings, codeGenSettings.listType)} ${styleNormalizedName(name, codeGenSettings.objectPropertyNameStyling)} { get{ return GameData.${styleNormalizedName(normalizeTextName(type), codeGenSettings.objectPropertyNameStyling)}[rawData.${styleNormalizedName(name, codeGenSettings.objectPropertyNameStyling)}]; } }\n`;                
            }
            else
            {
                mainDataImporterFile += `\t\tpublic ${referenceMapType(type, codeGenSettings, codeGenSettings.listType)} ${styleNormalizedName(name, codeGenSettings.objectPropertyNameStyling)} { get{ return rawData.${styleNormalizedName(name, codeGenSettings.objectPropertyNameStyling)}; } }\n`;
            }
            mainDataImporterFile += `\n`;


        }

        mainDataImporterFile += `\n\t\tpublic ${styleNormalizedName(normalizedObjectName, codeGenSettings.objectNameStyling)}(Raw rawData)\n{\n`;
        mainDataImporterFile += `\t\t\tthis.rawData = rawData;\n`;        
        mainDataImporterFile += `\t\t}\n\n`;
        

        mainDataImporterFile += "\t\t[JsonProperty]\n"
        mainDataImporterFile += `\t\tprivate Raw rawData;\n`;
        mainDataImporterFile += `\t\tpublic struct Raw\n\t\t{\n`;
         for(let i=0; i<headerRow.length;i++) {
            let type = headerRow[i].propertyType;
            let name = headerRow[i].propertyName;
            let description = headerRow[i].propertyDescription;

            if(tableData.primaryColumnIndex == i )
            {
                mainDataImporterFile += `\t\t\tpublic ${styleNormalizedName(normalizedObjectName.concat(["id"]), codeGenSettings.objectNameStyling)} ${styleNormalizedName(name, codeGenSettings.objectPropertyNameStyling)};\n`
            }
            else
            {
                mainDataImporterFile += '\t\t\tpublic {propertyType} {propertyName};'
                    .replace("{propertyType}",  rawMapType(type, codeGenSettings, codeGenSettings.listType))
                    .replace("{propertyName}",  styleNormalizedName(name, codeGenSettings.objectPropertyNameStyling))
                    .replace("{propertyDescription}", description).replace(/\n/g, "\n\t\t\t") +
                    '\n';
            }


        }
        mainDataImporterFile += `\t\t}\n`;


        mainDataImporterFile += "\t}\n";
    }


    mainDataImporterFile += "}";


    let mainDataJSONObject:any = {};
    for(let entryId in tableDataLookup)
    {

        let tableData = tableDataLookup[entryId];
        let headerRow = tableData.headerRow;   
        let normalizedObjectName = normalizeTextName(tableData.tableInfo.singleEntryObjectName);

        let tableDataObject:any ={}
        for(let rowIndex=0; rowIndex<tableData.parsedCSVEntryData.length; rowIndex++)
        {
            let tableEntryObject:any ={};
            for(let columnIndex=0; columnIndex<tableData.headerRow.length; columnIndex++)
            {
                let type = headerRow[columnIndex].propertyType;
                let name = headerRow[columnIndex].propertyName;

                let fieldName = styleNormalizedName(name, "camelCase");

                if(tableData.primaryColumnIndex == columnIndex)
                {
                    tableEntryObject[fieldName] = styleNormalizedName(normalizeTextName(tableData.parsedCSVEntryData[rowIndex][columnIndex]), "CamelCase");
                    
                }
                else if(isTableReferenceType(type,codeGenSettings))
                {
                    tableEntryObject[fieldName] = styleNormalizedName(normalizeTextName(tableData.parsedCSVEntryData[rowIndex][columnIndex]), "CamelCase");
                    
                }
                else
                {
                    tableEntryObject[fieldName] = typeEntry(tableData.parsedCSVEntryData[rowIndex][columnIndex], type)
                }
            }
            tableDataObject[styleNormalizedName(normalizeTextName(tableData.parsedCSVEntryData[rowIndex][tableData.primaryColumnIndex]), "CamelCase")] = tableEntryObject;
        }
        mainDataJSONObject[styleNormalizedName(normalizeTextName(tableData.tableName), codeGenSettings.objectNameStyling)] = JSON.stringify(tableDataObject);

    }
    const outDir = path.join(pathToOutDir, "Unity");
    tryMakeDir(outDir);
    fs.writeFile(
        path.join(outDir, "GameData.cs"), 
        mainDataImporterFile, 
        (err) => { if(err !== null) console.log(JSON.stringify(err)); }
    );
    fs.writeFile(
        path.join(outDir, "GameData.json"), 
        JSON.stringify(mainDataJSONObject), 
        (err) => { if(err !== null) console.log(JSON.stringify(err)); }
    );

}



function rawMapType(type:string, codeGenerator:ConfigCodeGeneratorEntry, listType:string) :string
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
    else
    {
        calculatedTypeMapping =  styleNormalizedName(normalizeTextName(tableDataLookup[typeInfo.baseType].tableInfo.singleEntryObjectName).concat(["id"]), "CamelCase"); //typeMapping["Any"];
    }

    return mappedType.replace("{propertyType}", calculatedTypeMapping);
}
function referenceMapType(type:string, codeGenerator:ConfigCodeGeneratorEntry, listType:string):string
{
    try
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
        else
        {
            let objectName = tableDataLookup[typeInfo.baseType].tableInfo.singleEntryObjectName;
            calculatedTypeMapping = styleNormalizedName(normalizeTextName(objectName), codeGenerator.objectNameStyling);
        }

        return mappedType.replace("{propertyType}", calculatedTypeMapping)
    }
    catch(err)
    {
        console.error(err);
    }
}

function isTableReferenceType(type:string, codeGenerator:ConfigCodeGeneratorEntry):boolean
{
    return !codeGenerator.typeMapping.hasOwnProperty(getBaseTypeAndListLevels(type).baseType);
}



function normalizeTextName(rawPropertyName:string):string[]
{
    try {
        return rawPropertyName.replace(/([A-Z][a-z])/g, ' $1') //First normalize the CamelCasing to Camel Casing
        .replace(/_/g, " ")//Then split out the underscore_spacing to underscore spacing
        .split(" ") //then split on spaces
        .map(entry => entry.toLocaleLowerCase()) //remove casing
        .filter(entry => entry !== ""); //remove empty strings

    } catch(err) {
        console.log(JSON.stringify(err));
    }
}

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
             console.log(`Could not find method to process value of type ${baseType}`);
        }
    }
    else return parse(val)[0].map((innerVal) => typeValue(innerVal, baseType, listLevels-1));
}


type CaseStyling = "CamelCase" | "camelCase" | "snake_case" | "SCREAMING_SNAKE_CASE" | "kebab-case" | "Train-Case" | "stUdLyCaPs";

type ColumnHeaderConfigKeywords = "PropertyName" | "PropertyType" | "PropertyDescription" | "SpecialModifer";
type TableHeaderConfigKeywords = "SingleEntryObjectName" | "CollectionLayoutType";
type PropertyKeywords = "PrimaryKey";
type CollectionLayoutType = "Dictionary" /*| "GroupedSets" | "GroupedDictionarys" | "Set"*/;

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
    
    headerMapping: {
        tableHeaders:TableHeaderConfigKeywords[][];
        columnHeaders:ColumnHeaderConfigKeywords[][];
    }
}

interface TypeMapping
{
    Any: string;
    String: string;
    Int: string;
    Float: string;
}

interface PropertyInfo
{ 
    propertyName:string[]; 
    propertyType:string;
    propertyDescription:string;
    propertyKeywords:PropertyKeywords;
}

interface TableInfo 
{
    singleEntryObjectName:string;
    collectionLayout:CollectionLayoutType;
}

interface TableData
{
    //Raw
    tableName:string;
    normalizedTableName:string[];
    parsedCSV : string[][];
    
    tableInfo:TableInfo;
    headerRow:PropertyInfo[];

    normalizedPropertyNames:string[];
    primaryColumnIndex:number;
    typedTable: any[][];
}

interface CollectedTableData
{
    parsedCSVEntryData:string[][],

    tableName:string;
    tableInfo:TableInfo;
    tableFormat:ConfigTableFormatEntry;
    headerRow:PropertyInfo[];

    normalizedPropertyNames:string[];
    primaryColumnIndex:number;
}

