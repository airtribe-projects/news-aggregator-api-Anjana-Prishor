// This file contains tests for the Express server using the tap testing framework and supertest for HTTP assertions. It tests user authentication, preferences management, and news retrieval endpoints.
const tap = require('tap');
const supertest = require('supertest');
const app = require('../app');
const server = supertest(app);

const mockUser = {
    name: 'Clark Kent',
    email: 'clark@superman.com',
    password: 'Krypt()n8',
    preferences:['movies', 'comics']
};

let token = '';

// Auth tests

tap.test('POST /register', async (t) => { 
    const response = await server.post('/register').send(mockUser);
    t.equal(response.status, 200);
    t.end();
});

tap.test('POST /register with missing email', async (t) => {
    const response = await server.post('/register').send({
        name: mockUser.name,
        password: mockUser.password
    });
    t.equal(response.status, 400);
    t.end();
});

//Login tests
// "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImNsYXJrQHN1cGVybWFuLmNvbSIsImlhdCI6MTc4MDQxMjM3NCwiZXhwIjoxNzgwNDE1OTc0fQ.nTWM3ZsIs_RUzg5xzLjdFgVBa5Jbl_5rDijDpW937tE"
tap.test('POST /login', async (t) => { 
    const response = await server.post('/login').send({
        email: mockUser.email,
        password: mockUser.password
    });
    t.equal(response.status, 200);
    t.hasOwnProp(response.body, 'token');
    token = response.body.token;
    t.end();
});

tap.test('POST /login with wrong password', async (t) => {
    const response = await server.post('/login').send({
        email: mockUser.email,
        password: 'wrongpassword'
    });
    t.equal(response.status, 401);
    t.end();
});

// Preferences tests

tap.test('GET /preferences', async (t) => {
    const response = await server.get('/preferences').set('Authorization', `Bearer ${token}`);
    t.equal(response.status, 200);
    t.hasOwnProp(response.body, 'preferences');
    t.same(response.body.preferences, mockUser.preferences);
    t.end();
});

tap.test('GET /preferences without token', async (t) => {
    const response = await server.get('/preferences');
    t.equal(response.status, 401);
    t.end();
});

tap.test('PUT /preferences', async (t) => {
    const response = await server.put('/preferences').set('Authorization', `Bearer ${token}`).send({
        preferences: ['movies', 'comics', 'games']
    });
    t.equal(response.status, 200);
});

tap.test('Check PUT /preferences', async (t) => {
    const response = await server.get('/preferences').set('Authorization', `Bearer ${token}`);
    t.equal(response.status, 200);
    t.same(response.body.preferences, ['movies', 'comics', 'games']);
    t.end();
});

// News tests

tap.test('GET /news', async (t) => {
    const response = await server.get('/news').set('Authorization', `Bearer ${token}`);
    t.equal(response.status, 200);
    t.hasOwnProp(response.body, 'news');
    t.end();
});

tap.test('GET /news without token', async (t) => {
    const response = await server.get('/news');
    t.equal(response.status, 401);
    t.end();
});