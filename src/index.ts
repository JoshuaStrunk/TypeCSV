import * as path from "path";
import * as fs from "fs";

import * as parse from "csv-parse/lib/sync";


let config :tscvConfigEntry = null;

(function() {


    let pathToData = path.join(process.cwd(), process.argv[2]);
    let pathToOutDir = path.join(process.cwd(), "out");
    if(process.argv.length > 3) 
    {
        pathToOutDir = path.join(process.cwd(), process.argv[3]);
    }

    try {
        fs.mkdirSync(pathToOutDir);
    }
    catch(e) {
        if(e.code !== "EEXIST") {
            console.error(JSON.stringify(e));
            return;
        }
    }


    try
    {
        let test = fs.readdirSync(pathToData);
        console.log(JSON.stringify(test));

        //Get out the config file
        let configFile = test.filter( value => value == "tcsvconfig.json" );
        console.assert(configFile.length>0, "No config file found");
        config = JSON.parse(fs.readFileSync(path.join(pathToData, configFile[0]),"utf8" ));


        for(let i=0; i<test.length; i++) 
        {
            let fileName = test[i];

            if(path.extname(fileName) === ".csv")
            {
                genTable(path.join(pathToData, fileName), pathToOutDir);
            }
        }
    }
    catch(e) 
    {
        if(e.code === "ENOTDIR") genTable(pathToData, pathToOutDir);
        else console.error(e);
    }


}())

function genTable(filePath:string, outPath:string) {
     fs.readFile(filePath, 'utf8', (err, data) => {

        if(err != null) {
            switch(err.code) {
                case "ENOENT": console.log(`File ${process.argv[2]} does not exist`); break;
                default: console.log(JSON.stringify(err)); break;
            }
            return;
        }

        let parsedCSV : string[][] = parse(data);
        let tableName  = path.basename(filePath, '.csv');

        let headerRow:HeaderRowEntry[] = [];

        let normalizedPropertyNames:string[] = [];

        let primaryColumnIndex = 0;

        parsedCSV[0].forEach((value, index) => {


            let splitHeaderValue = value.split(':');
            headerRow.push({
                propertyName:   normalizePropertyName(splitHeaderValue[0]),
                propertyType:   splitHeaderValue.length > 1 ? splitHeaderValue[1]: "Any",
                specialKey:     splitHeaderValue.length > 2 ? splitHeaderValue[2]: null,
            });

            let normalizedPropertyName = normalizePropertyName(splitHeaderValue[0]);
            console.log(JSON.stringify(normalizedPropertyName));
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
            if(headerRow[headerRow.length-1].specialKey == "PrimaryKey") {
                primaryColumnIndex = index;
            }

        });



        let jsonified:{[primaryKey:string] : any} = {};
        for(let i =1; i<parsedCSV.length; i++) {
            let entryRow = parsedCSV[i];
            let primaryKeyValue = entryRow[primaryColumnIndex];
            if(jsonified.hasOwnProperty(primaryKeyValue)) {
                console.error(`Exited before completion: ${tableName}'s PrimiaryKey(${headerRow[primaryColumnIndex].propertyName}) integrity is compromised duplicate key ${primaryKeyValue} found on row ${i+1}.`);
                return;
            }
            jsonified[primaryKeyValue] = {};
            for(let j=0; j<headerRow.length; j++) {
                let headerEntry = headerRow[j];
                jsonified[primaryKeyValue][headerEntry.propertyName.join("_")] = typeEntry(entryRow[j], headerEntry.propertyType);
            }
        }

        let generatedFiles: {[key:string]: string} = {}

        for(let genId in config.codeGenerators) {
            if(config.codeGenerators.hasOwnProperty(genId))
            {
                generatedFiles[genId] = config.codeGenerators[genId].objectOpen.replace("{objectName}", tableName)+'\n';
            }
        }

        for(let i=0; i<headerRow.length;i++) {
            let type = headerRow[i].propertyType;
            let name = headerRow[i].propertyName;

            for(let genId in config.codeGenerators) {
                let codeGenerator = config.codeGenerators[genId];
                if(config.codeGenerators.hasOwnProperty(genId))
                {
                    generatedFiles[genId] += '\t' + codeGenerator.objectProperty
                        .replace("{propertyType}",  mapType(type, codeGenerator.typeMapping, codeGenerator.listType))
                        .replace("{propertyName}",  mapPropertyName(name, codeGenerator.objectPropertyNameStyling)) + '\n';
                }
            }
        }
        for(let genId in config.codeGenerators) {
            if(config.codeGenerators.hasOwnProperty(genId))
            {
                generatedFiles[genId] += config.codeGenerators[genId].objectClose+'\n';
                 fs.writeFile(
                    path.join(outPath, `${tableName}{ext}`.replace("{ext}", config.codeGenerators[genId].ext)), 
                    generatedFiles[genId], 
                    (err) => { if(err !== null) console.error(JSON.stringify(err)); }
                );
            }
        }
    });
}

function mapType(type:string, typeMapping:TypeMapping, listType:string) :string
{
    let mappedType = "{propertyType}";
    let typeInfo = getBaseTypeAndListLevels(type);
    for(let i=0; i<typeInfo.listLevels; i++) {
        mappedType = mappedType.replace("{propertyType}", listType);
    }
    return mappedType.replace("{propertyType}", typeMapping[typeInfo.baseType]);
    
    
}

function normalizePropertyName(rawPropertyName:string):string[]
{
    return rawPropertyName.replace(/([A-Z][a-z])/g, ' $1') //First normalize the CamelCasing to Camel Casing
    .replace(/_/g, " ")//Then split out the underscore_spacing to underscore spacing
    .split(" ") //then split on spaces
    .map(entry => entry.toLocaleLowerCase()) //remove casing
    .filter(entry => entry !== ""); //remove empty strings
}

type CaseStyling = "CamelCase" | "camelCase" | "snake_case" | "SCREAMING_SNAKE_CASE" | "kebab-case" | "Train-Case" | "stUdLyCaPs";

function mapPropertyName(normalizedPropertyName:string[], styling:CaseStyling):string
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



function typeEntry(val:string, type:string) {

    let typeInfo = getBaseTypeAndListLevels(type);
    return typeValue(val, typeInfo.baseType, typeInfo.listLevels);
}


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

function getBaseTypeAndListLevels(val:string) {
    let i=0;
    for(;val.slice(val.length-2) === "[]"; i++, val= val.slice(0,val.length-2)) { }
   
    return {
        listLevels: i,
        baseType: val
    };
}

function typeValue(val:string, baseType:string, listLevels:number) {
    if(listLevels < 1) return validTypes[baseType](val);
    else return parse(val)[0].map((innerVal) => typeValue(innerVal, baseType, listLevels-1));
}


interface tscvConfigEntry {
    codeGenerators: {[key:string]: configCodeGeneratorEntry}
}

interface configCodeGeneratorEntry {
    ext:string,
    objectOpen:string,
    objectClose:string,
    objectProperty:string,
    objectPropertyNameStyling:CaseStyling,
    typeMapping: TypeMapping,
    listType:string
}

interface TypeMapping {
    Any: string,
    String: string,
    Int: string,
    Float: string,
}

interface HeaderRowEntry
{ 
    propertyName:string[], 
    propertyType:string, 
    specialKey:string 
}
