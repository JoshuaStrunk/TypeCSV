import * as path from "path";
import * as fs from "fs";

import * as parse from "csv-parse/lib/sync";

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

        let csFile = "public class {0} {\n".replace("{0}", tableName);
        let tsFile = "interface {0} {\n".replace("{0}", tableName);
        for(let i=0; i<headerRow.length;i++) {
            let type = headerRow[i].propertyType;
            let name = headerRow[i].propertyName;
            csFile += "   "+ cSharpProp.replace("{type}", toCSharpType(type)).replace("{name}", name);
            tsFile += "   "+ typeScriptProp.replace("{type}", toTypeScriptType(type)).replace("{name}", name)
        }
        csFile += "}\n";
        tsFile += "}\n";


        fs.writeFile(
            path.join(outPath, `${tableName}.cs`), 
            csFile, 
            (err) => { if(err !== null) console.error(JSON.stringify(err)); }
        );

        fs.writeFile(
            path.join(outPath, `${tableName}.d.ts`), 
            tsFile, 
            (err) => { if(err !== null) console.error(JSON.stringify(err)) }
        );

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

    "Int[]":      (val:string) => val.split(',').map( (innerVal) => validTypes["Int"](innerVal) ),
    "String[]":   (val:string) => val.split(',').map( (innerVal) => validTypes["String"](innerVal) ),   
};

const cSharpProp = "public {type} {name};\n";

function toCSharpType(type:string) {
    switch(type) {
        case "Any":
        case "String": 
            return "string";
        case "Int": return "int";
        case "Float": return "float";

        case "Int[]": return "int[]";
        case "String[]": return "string[]";
    }
}

const typeScriptProp = "{name} : {type},\n";

function toTypeScriptType(type:string){
    switch(type) {
        case "Any":       
        case "String":
            return "string";
        case "Int":
        case "Float":
            return "number";
        case "Int[]":       
            return "number[]";
        case "String[]":    
            return "string[]";
    }
}



interface HeaderRowEntry
{ 
    propertyName:string, 
    propertyType:string, 
    specialKey:string 
}
