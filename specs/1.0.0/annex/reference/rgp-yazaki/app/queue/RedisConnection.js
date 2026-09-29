import {
  env,
} from '../globals/_.js'

/**
 * Redis connection settings shared by the queue and the progress channel.
 *
 * `PROC-01` and `PROC-02` must reach the **same** Redis: the queue carries work from the API to
 * the worker, and the progress channel carries events back the other way (`ADR-13`). Building both
 * option sets from one object is what keeps them from drifting to different hosts.
 */
export default class RedisConnection {
  /**
   * Constructor.
   *
   * @param {RedisConnectionParams} params - Parameters of this constructor.
   */
  constructor ({
    host,
    port,
    password,
  }) {
    this.host = host
    this.port = port
    this.password = password
  }

  /**
   * Factory method.
   *
   * @param {{
   *   host?: string
   *   port?: number
   *   password?: string
   * }} [params] - Parameters of this factory method.
   * @returns {RedisConnection} - Instance of this constructor.
   */
  static create ({
    host = env.REDIS_HOST,
    port = Number(env.REDIS_PORT),
    password = env.REDIS_PASSWORD,
  } = {}) {
    return new this({
      host,
      port,
      password,
    })
  }

  /**
   * Generate the options BullMQ connects its queues and workers with.
   *
   * `maxRetriesPerRequest` **must** be null. BullMQ blocks on Redis while waiting for a job, and
   * ioredis's default retry cap turns that wait into a thrown error; the worker would then die
   * whenever a queue happened to be idle.
   *
   * @returns {{
   *   host: string
   *   port: number
   *   password: string
   *   maxRetriesPerRequest: null
   * }} - Connection options for BullMQ.
   */
  generateConnectionOptions () {
    return {
      host: this.host,
      port: this.port,
      password: this.password,
      maxRetriesPerRequest: null,
    }
  }

  /**
   * Generate the options the progress PubSub channel connects with.
   *
   * @returns {{
   *   host: string
   *   port: number
   *   password: string
   * }} - Connection options for PubSub.
   */
  generatePubSubOptions () {
    return {
      host: this.host,
      port: this.port,
      password: this.password,
    }
  }
}

/**
 * @typedef {{
 *   host: string
 *   port: number
 *   password: string
 * }} RedisConnectionParams
 */
