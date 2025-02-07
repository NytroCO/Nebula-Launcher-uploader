import { createHash } from 'crypto'
import { lstat, pathExists, readdir, readFile, Stats } from 'fs-extra'
import { Module, Type, TypeMetadata } from 'helios-distribution-types'
import { resolve } from 'path'
import { BaseModelStructure } from '../basemodel.struct'
import { LibraryType } from '../../../claritas/ClaritasLibraryType'
import { ClaritasResult, ClaritasModuleMetadata } from '../../../claritas/ClaritasResult'
import { ClaritasWrapper } from '../../../../util/java/ClaritasWrapper'
import { MinecraftVersion } from '../../../../util/MinecraftVersion'

export interface ModuleCandidate {
    file: string
    filePath: string
    stats: Stats
}

export interface ClaritasException {
    exceptionName: string
    proxyMetadata: ClaritasModuleMetadata
}

export abstract class ModuleStructure extends BaseModelStructure<Module> {

    private readonly crudeRegex = /(.+?)-(.+).[jJ][aA][rR]/
    protected readonly DEFAULT_VERSION = '0.0.0'

    protected claritasResult!: ClaritasResult

    constructor(
        absoluteRoot: string,
        relativeRoot: string,
        structRoot: string,
        baseUrl: string,
        protected minecraftVersion: MinecraftVersion,
        protected type: Type,
        protected filter?: ((name: string, path: string, stats: Stats) => boolean)
    ) {
        super(absoluteRoot, relativeRoot, structRoot, baseUrl)
    }

    public async getSpecModel(): Promise<Module[]> {
        if (this.resolvedModels == null) {
            this.resolvedModels = await this._doModuleRetrieval(await this._doModuleDiscovery(this.containerDirectory))
        }

        return this.resolvedModels
    }

    protected getDefaultGroup(): string {
        return `generated.${this.type.toLowerCase()}`
    }

    protected generateMavenIdentifier(group: string, id: string, version: string): string {
        return `${group}:${id}:${version}@${TypeMetadata[this.type].defaultExtension}`
    }

    protected attemptCrudeInference(name: string): { name: string, version: string } {
        const result = this.crudeRegex.exec(name)
        if(result != null) {
            return {
                name: result[1],
                version: result[2]
            }
        } else {
            return {
                name: name.substring(0, name.lastIndexOf('.')),
                version: this.DEFAULT_VERSION
            }
        }
    }

    protected getClaritasGroup(path: string): string {
        return this.claritasResult[path]?.group || this.getDefaultGroup()
    }

    protected getClaritasExceptions(): ClaritasException[] {
        return []
    }

    protected getClaritasType(): LibraryType | null {
        return null
    }

    protected async abstract getModuleId(name: string, path: string): Promise<string>
    protected async abstract getModuleName(name: string, path: string): Promise<string>
    protected async abstract getModuleUrl(name: string, path: string, stats: Stats): Promise<string>
    protected async abstract getModulePath(name: string, path: string, stats: Stats): Promise<string | null>

    protected async parseModule(file: string, filePath: string, stats: Stats): Promise<Module> {
        const buf = await readFile(filePath)
        const mdl: Module = {
            id: await this.getModuleId(file, filePath),
            name: await this.getModuleName(file, filePath),
            type: this.type,
            required: {
                value: true,
                def: true
            },
            artifact: {
                size: stats.size,
                MD5: createHash('md5').update(buf).digest('hex'),
                url: await this.getModuleUrl(file, filePath, stats)
            }
        }
        const pth = await this.getModulePath(file, filePath, stats)
        if (pth) {
            mdl.artifact.path = pth
        }
        return mdl
    }

    protected async _doModuleDiscovery(scanDirectory: string): Promise<ModuleCandidate[]> {

        const moduleCandidates: ModuleCandidate[] = []

        if (await pathExists(scanDirectory)) {
            const files = await readdir(scanDirectory)
            for (const file of files.sort(((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'})))) {
                const filePath = resolve(scanDirectory, file)
                const stats = await lstat(filePath)
                if (stats.isFile()) {
                    if(this.filter == null || this.filter(file, filePath, stats)) {
                        moduleCandidates.push({file, filePath, stats})
                    }
                }
            }
        }

        return moduleCandidates

    }

    protected async invokeClaritas(moduleCandidates: ModuleCandidate[]): Promise<void> {
        if(this.getClaritasType() != null) {
            const claritasExecutor = new ClaritasWrapper(this.absoluteRoot)

            let claritasCandidates = moduleCandidates
            const exceptionCandidates: [ModuleCandidate, ClaritasException][] = []
            for(const exception of this.getClaritasExceptions()) {
                const exceptionCandidate = moduleCandidates.find((value) => value.file.toLowerCase().indexOf(exception.exceptionName) > -1)
                if(exceptionCandidate != null) {
                    exceptionCandidates.push([exceptionCandidate, exception])
                    claritasCandidates = claritasCandidates.filter((value) => value.file.toLowerCase().indexOf(exception.exceptionName) === -1)
                }
            }

            this.claritasResult = await claritasExecutor.execute(
                this.getClaritasType()!,
                this.minecraftVersion,
                claritasCandidates.map(entry => entry.filePath)
            )

            if(this.claritasResult == null) {
                this.logger.error('Failed to process Claritas result!')
            } else {
                for(const [candidate, exception] of exceptionCandidates) {
                    this.claritasResult[candidate.filePath] = exception.proxyMetadata
                }
            }
        }
    }

    protected async _doModuleRetrieval(moduleCandidates: ModuleCandidate[], options?: {
        preProcess?: (candidate: ModuleCandidate) => void
        postProcess?: (module: Module) => void
    }): Promise<Module[]> {

        const accumulator: Module[] = []

        if(moduleCandidates.length > 0) {

            // Invoke Claritas and attach result to class.
            await this.invokeClaritas(moduleCandidates)

            // Process Modules
            for(const candidate of moduleCandidates) {
                options?.preProcess?.(candidate)
                const mdl = await this.parseModule(candidate.file, candidate.filePath, candidate.stats)
                options?.postProcess?.(mdl)
                accumulator.push(mdl)
            }

        }

        return accumulator

    }

}
