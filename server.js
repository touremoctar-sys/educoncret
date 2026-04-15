// server.js - Backend Node.js/Express
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Lecture de la clé API depuis les variables d'environnement
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || req.body.apiKey
});

// Endpoint pour analyser un document avec OpenAI
app.post('/api/analyze-document', upload.single('document'), async (req, res) => {
  try {
    const file = req.file;
    const apiKey = req.body.apiKey;
    
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }
    
    // Lire le contenu du fichier
    let fileContent = '';
    const filePath = file.path;
    
    // Pour les fichiers texte/PDF simple (en production, utilisez pdf-parse)
    if (file.mimetype === 'text/plain') {
      fileContent = fs.readFileSync(filePath, 'utf8');
    } else if (file.mimetype === 'application/pdf') {
      // Utiliser pdf-parse pour extraire le texte des PDF
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      fileContent = pdfData.text;
    } else {
      fileContent = `[Document: ${file.originalname}] - Type: ${file.mimetype}`;
    }
    
    // Nettoyer le fichier temporaire
    fs.unlinkSync(filePath);
    
    // Prompt système pour l'IA
    const systemPrompt = `Tu es un auditeur Qualiopi expert. Analyse le document suivant et identifie les non-conformités par rapport au référentiel national qualité.
    
    Retourne UNIQUEMENT un JSON valide avec cette structure exacte :
    {
      "results": [
        {
          "indicator": "Q1.1",
          "status": "conforme" | "non_conforme" | "partiel",
          "reason": "Explication détaillée",
          "action": "Action corrective proposée"
        }
      ],
      "global_score": 0-100,
      "summary": "Résumé global de l'analyse"
    }
    
    Indicateurs à vérifier : Q1.1 (information publique), Q1.2 (prise en charge), Q2.2 (handicap), Q3.1 (suivi), Q4.3 (évaluation), Q7.3 (réclamations).`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Document à analyser :\n\n${fileContent.substring(0, 8000)}` }
      ],
      temperature: 0.3
    });
    
    const aiResponse = response.choices[0].message.content;
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { results: [], global_score: 50, summary: 'Analyse terminée' };
    
    res.json({ success: true, ...result });
    
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint pour sauvegarder les preuves
app.post('/api/save-evidence', async (req, res) => {
  const { name, linkedTo, userId } = req.body;
  // Ici, vous stockeriez en base de données
  res.json({ success: true, evidence: { name, linkedTo, date: new Date().toISOString() } });
});

// Endpoint pour sauvegarder l'état de l'application
app.post('/api/save-state', async (req, res) => {
  const { userId, state } = req.body;
  // Stocker en base de données (exemple avec fichier JSON)
  const userFile = `./users/${userId}.json`;
  fs.writeFileSync(userFile, JSON.stringify(state));
  res.json({ success: true });
});

app.get('/api/load-state/:userId', async (req, res) => {
  const userFile = `./users/${req.params.userId}.json`;
  if (fs.existsSync(userFile)) {
    const state = fs.readFileSync(userFile, 'utf8');
    res.json(JSON.parse(state));
  } else {
    res.json({ success: false });
  }
});

app.listen(3000, () => {
  console.log('Serveur démarré sur http://localhost:3000');
  // Créer les dossiers nécessaires
  if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
  if (!fs.existsSync('./users')) fs.mkdirSync('./users');
});
