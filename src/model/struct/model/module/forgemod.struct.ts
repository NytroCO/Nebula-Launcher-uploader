import { Stats } from 'fs-extra'
import { Type } from 'helios-distribution-types'
import { join } from 'path'
import { resolve } from 'url'
import { VersionSegmented } from '../../../../util/VersionSegmented'
import { MinecraftVersion } from '../../../../util/MinecraftVersion'
import { ToggleableModuleStructure } from './toggleablemodule.struct'
import { LibraryType } from '../../../claritas/ClaritasLibraryType'
import { ClaritasException } from './module.struct'

export abstract class BaseForgeModStructure extends ToggleableModuleStructure implements VersionSegmented {

    protected readonly EXAMPLE_MOD_ID = 'examplemod'

    constructor(
        absoluteRoot: string,
        relativeRoot: string,
        baseUrl: string,
        minecraftVersion: MinecraftVersion
    ) {
        super(absoluteRoot, relativeRoot, 'forgemods', baseUrl, minecraftVersion, Type.ForgeMod)
    }

    public abstract isForVersion(version: MinecraftVersion, libraryVersion: string): boolean

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async getModuleUrl(name: string, path: string, stats: Stats): Promise<string> {
        return resolve(this.baseUrl, join(this.relativeRoot, this.getActiveNamespace(), name))
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async getModulePath(name: string, path: string, stats: Stats): Promise<string | null> {
        return null
    }

    protected getClaritasExceptions(): ClaritasException[] {
        return [{
            exceptionName: 'optifine',
            proxyMetadata: {
                group: 'net.optifine'
            }
        }]
    }

    protected getClaritasType(): LibraryType {
        return LibraryType.FORGE
    }

    protected discernResult(claritasValue: string | undefined, crudeInference: string): string {
        return (claritasValue == null || claritasValue == '') ? crudeInference : claritasValue
    }

}
