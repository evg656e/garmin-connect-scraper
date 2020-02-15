import j from '@hapi/joi';

function createValidator(schema) {
    return function validate(data) {
        const { error, value } = schema.validate(data);
        if (error)
            throw error;
        return value;
    };
}

const credentialsSchema = j.object({
    username: j.string().email().required(),
    password: j.string().required()
});

export const validateCredentials = createValidator(credentialsSchema);

const activitiesCommonSchema = () => ({
    path: j.string().required(),
    pick: j.array().items(
        j.string(),
        j.array().length(2).items(j.string())
    )
});

export const validateConfig = createValidator(
    j.object({
        general: j.object({
            requestDelay: j.number().integer(),
            baseDir: j.string(),
            defaultPickPolicy: j.string().valid('all', 'notNull')
        }),
        puppeteer: j.object({
            launchOptions: j.object({
            }).unknown()
        }),
        credentials: credentialsSchema,
        activities: j.object({
            search: j.object({
                parameters: j.object({
                    activityType: j.string(),
                    activitySubType: j.string(),
                    start: j.number().integer(),
                    limit: j.number().integer()
                }).unknown(),
                finish: j.number().integer(),
                ...activitiesCommonSchema()
            }),
            fetch: j.array().items(j.object({
                url: j.string().required(),
                title: j.string(),
                ...activitiesCommonSchema()
            }))
        })
    })
);

export const validateActivities = createValidator(
    j.array().items(j.object({
        activityId: j.number().integer().required()
    }).unknown())
);
