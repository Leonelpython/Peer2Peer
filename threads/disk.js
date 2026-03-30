import fs from "fs"

export async function update(file, arr) {
    if(fs.existsSync(file)) {
        for(let item of arr) {
            fs.appendFile(file, item, (err) => {
                if(err) {
                    console.error(`error append: ${err}`)
                }
            })
        }
    } else {
        fs.writeFile(file, arr, (err) => {
            if(err) {
                fs.writeFileSync(file, JSON.stringify(arr))
            }
        })
    }
}

export async function writefile(file, storage, piece_length) {
    let offset = 0
    fs.open(file, 'w', (err, fd) => {
        if(err) {
            console.error(`error open file: ${err}`)
        }
        for(let i = 0; i < storage.length; i++) {
            fs.write(fd, storage[i], offset, (err, written, buffer) => {
                if(err) {
                    console.error(`error writting file: ${err}`)
                } else {
                    offset += piece_length
                }
            })
        }
    })
}