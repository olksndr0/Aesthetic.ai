import 'server-only'

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { env } from './env'

// Every object is private: nothing here is ever served from /public or by a
// public bucket URL. Images reach the browser only through
// /api/simulations/[id]/image, which checks the owner first.
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer>
  remove(key: string): Promise<void>
}

function safeKey(key: string): string {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) {
    throw new Error('Invalid storage key')
  }
  return key
}

class LocalStorage implements Storage {
  private root = path.resolve(process.cwd(), env.storage.localDir)

  private file(key: string): string {
    return path.join(this.root, safeKey(key))
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.file(key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data)
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.file(key))
  }

  async remove(key: string): Promise<void> {
    await rm(this.file(key), { force: true })
  }
}

class S3Storage implements Storage {
  private clientPromise = import('@aws-sdk/client-s3').then(sdk => ({
    sdk,
    client: new sdk.S3Client({
      region: env.storage.region,
      endpoint: env.storage.endpoint || undefined,
      forcePathStyle: Boolean(env.storage.endpoint),
      credentials: { accessKeyId: env.storage.accessKeyId, secretAccessKey: env.storage.secretAccessKey },
    }),
  }))

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const { sdk, client } = await this.clientPromise
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: env.storage.bucket,
        Key: safeKey(key),
        Body: data,
        ContentType: contentType,
        ServerSideEncryption: env.storage.endpoint ? undefined : 'AES256',
      }),
    )
  }

  async get(key: string): Promise<Buffer> {
    const { sdk, client } = await this.clientPromise
    const result = await client.send(new sdk.GetObjectCommand({ Bucket: env.storage.bucket, Key: safeKey(key) }))
    if (!result.Body) throw new Error('Object not found')
    return Buffer.from(await result.Body.transformToByteArray())
  }

  async remove(key: string): Promise<void> {
    const { sdk, client } = await this.clientPromise
    await client.send(new sdk.DeleteObjectCommand({ Bucket: env.storage.bucket, Key: safeKey(key) }))
  }
}

let instance: Storage | undefined

export function storage(): Storage {
  instance ??= env.storage.driver === 's3' ? new S3Storage() : new LocalStorage()
  return instance
}
