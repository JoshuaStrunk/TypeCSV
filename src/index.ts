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

        let primaryColumnIndex = 0;

        parsedCSV[0].forEach((value, index) => {


            let splitHeaderValue = value.split(':');
            headerRow.push({
                propertyName:   splitHeaderValue[0],
                propertyType:   splitHeaderValue.length > 1 ? splitHeaderValue[1]: "Any",
                specialKey:     splitHeaderValue.length > 2 ? splitHeaderValue[2]: null,
            });

            //Override default primary Column?
            if(headerRow[headerRow.length-1].specialKey == "PrimaryKey") {
                primaryColumnIndex = index;
            }

        });

        let jsonified:{[primaryKey:string] : any} = {};
        for(let i =1; i<parsedCSV.length; i++) {
            let entryRow = parsedCSV[i];
            let pk = entryRow[primaryColumnIndex];
            if(jsonified.hasOwnProperty(pk)) {
                console.error(`Exited before completion: ${tableName}'s PrimiaryKey(${headerRow[primaryColumnIndex].propertyName}) integrity is compromised duplicate key ${pk} found on row ${i+1}.`);
                return;
            }
            jsonified[pk] = {};
            for(let j=0; j<headerRow.length; j++) {
                let headerEntry = headerRow[j];
                jsonified[pk][headerEntry.propertyName] = typeEntry(entryRow[j], headerEntry.propertyType);
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
                if(config.codeGenerators.hasOwnProperty(genId))
                {
                    generatedFiles[genId] += '\t' + config.codeGenerators[genId].objectProperty
                        .replace("{propertyType}", config.codeGenerators[genId].typeMapping[type])
                        .replace("{propertyName}", name) + '\n';
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


function typeEntry(val:string, type:string) {
    return validTypes[type](val);
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
    },

    "Int[]":        (val:string) => parse(val)[0].map((innerVal) => validTypes["Int"](innerVal)),
    "String[]":     (val:string) => parse(val)[0].map((innerVal) => validTypes["String"](innerVal)),
    "Int[][]":      (val:string) => parse(val)[0].map((innerVal) => validTypes["Int[]"](innerVal)),
    "String[][]":   (val:string) => parse(val)[0].map((innerVal) => validTypes["String[]"](innerVal)), 
};


interface tscvConfigEntry {
    codeGenerators: {[key:string]: configCodeGeneratorEntry}
}

interface configCodeGeneratorEntry {
    ext:string,
    objectOpen:string,
    objectClose:string,
    objectProperty:string,
    typeMapping:{
        Any: string,
        String: string,
        Int: string,
        Float: string,
    },
    listType:string
}


interface HeaderRowEntry
{ 
    propertyName:string, 
    propertyType:string, 
    specialKey:string 
}
