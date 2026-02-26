// Question Flow and Job-Specific Logic Functions

/**
 * Determines the next question based on job sector and previous responses
 */
function getNextQuestion(currentContext) {
  const { jobSector, interactionHistory, responseData } = currentContext;
  
  // Basic information questions always come first
  if (!responseData.name || !responseData.contactInfo) {
    return {
      type: 'basic_info',
      question: getBasicInfoQuestion(responseData),
      required: true
    };
  }
  
  // Determine if we need job-specific questions
  if (jobSector && !currentContext.jobSpecificComplete) {
    const jobSpecificQuestion = getJobSpecificQuestion(jobSector, responseData);
    if (jobSpecificQuestion) {
      return {
        type: 'job_specific',
        question: jobSpecificQuestion,
        sector: jobSector
      };
    }
  }
  
  // Default follow-up questions
  return {
    type: 'follow_up',
    question: getDefaultFollowUpQuestion(responseData),
    conditional: true
  };
}

/**
 * Gets appropriate basic information question based on what's missing
 */
function getBasicInfoQuestion(responseData) {
  if (!responseData.name) {
    return "Could you please tell me your name?";
  } else if (!responseData.email && !responseData.phone) {
    return "How can I contact you? Please provide your email or phone number.";
  } else if (!responseData.initialInterest) {
    return "What brings you to us today?";
  }
  return "Is there anything else you'd like to share?";
}

/**
 * Gets job-specific questions based on sector
 */
function getJobSpecificQuestion(jobSector, responseData) {
  const questionTemplates = {
    'information_technology': [
      "What type of technical challenge are you facing?",
      "Which programming languages or technologies are you working with?",
      "Have you tried troubleshooting steps already?"
    ],
    'healthcare': [
      "What medical specialty are you in?",
      "Are you looking for patient management or administrative tools?",
      "Do you have specific compliance requirements?"
    ],
    'sales': [
      "What products or services do you sell?",
      "What's your typical sales cycle?",
      "What challenges are you facing in your sales process?"
    ],
    'finance': [
      "What financial services are you interested in?",
      "Do you need compliance or reporting tools?",
      "What's your current volume of transactions?"
    ],
    'education': [
      "What age group or subject do you teach?",
      "Are you looking for classroom management tools?",
      "Do you need parent communication systems?"
    ]
  };
  
  const sectorQuestions = questionTemplates[jobSector];
  if (!sectorQuestions) return null;
  
  // Find a question that hasn't been answered yet
  for (const question of sectorQuestions) {
    if (!questionHasBeenAsked(question, interactionHistory)) {
      return question;
    }
  }
  
  // Mark job-specific questions as complete
  return null;
}

/**
 * Gets default follow-up question based on previous responses
 */
function getDefaultFollowUpQuestion(responseData) {
  if (responseData.positiveResponse) {
    return "Great! When would be a good time to discuss this further?";
  } else if (responseData.neutralResponse) {
    return "I'd love to learn more about your needs. Could you elaborate?";
  } else {
    return "Is there anything else I can help you with today?";
  }
}

/**
 * Checks if a question has been asked before
 */
function questionHasBeenAsked(question, history) {
  if (!history || history.length === 0) return false;
  
  return history.some(entry => 
    entry.question.toLowerCase().includes(question.toLowerCase().split(' ')[0])
  );
}

/**
 * Updates user profile based on responses
 */
function updateUserProfile(currentProfile, newResponses) {
  const updatedProfile = { ...currentProfile };
  
  // Update with new responses
  for (const [key, value] of Object.entries(newResponses)) {
    if (value !== undefined && value !== null && value !== '') {
      updatedProfile[key] = value;
    }
  }
  
  // Set timestamps
  updatedProfile.lastInteraction = new Date().toISOString();
  updatedProfile.responseHistory = updatedProfile.responseHistory || [];
  updatedProfile.responseHistory.push({
    timestamp: new Date().toISOString(),
    responses: newResponses
  });
  
  return updatedProfile;
}

/**
 * Determines conversation flow based on engagement level
 */
function determineConversationFlow(userProfile, currentResponses) {
  const engagementScore = calculateEngagementScore(userProfile, currentResponses);
  
  if (engagementScore > 0.7) {
    // High engagement - deeper conversation
    return {
      depth: 'deep',
      nextTopic: 'solutionExploration',
      suggestedActions: ['scheduleDemo', 'sendInformation']
    };
  } else if (engagementScore > 0.3) {
    // Medium engagement - continue basic conversation
    return {
      depth: 'medium',
      nextTopic: 'needsAssessment',
      suggestedActions: ['askMoreQuestions', 'provideGeneralInfo']
    };
  } else {
    // Low engagement - shorter interaction
    return {
      depth: 'shallow',
      nextTopic: 'quickResolution',
      suggestedActions: ['provideContact', 'endPolitely']
    };
  }
}

/**
 * Calculates engagement score based on responses and behavior
 */
function calculateEngagementScore(userProfile, currentResponses) {
  let score = 0;
  const totalFactors = 5;
  
  // Factor 1: Response completeness
  if (Object.keys(currentResponses).length >= 3) score += 0.2;
  
  // Factor 2: Positive sentiment indicators
  const positiveKeywords = ['yes', 'sure', 'interested', 'great', 'love', 'want'];
  const responseText = Object.values(currentResponses).join(' ').toLowerCase();
  if (positiveKeywords.some(word => responseText.includes(word))) score += 0.2;
  
  // Factor 3: Previous interaction history
  if (userProfile.responseHistory && userProfile.responseHistory.length > 1) score += 0.2;
  
  // Factor 4: Contact information provided
  if (userProfile.email || userProfile.phone) score += 0.2;
  
  // Factor 5: Interest indicators
  if (currentResponses.requestInfo || currentResponses.scheduleMeeting) score += 0.2;
  
  return Math.min(score, 1.0); // Cap at 1.0
}

module.exports = {
  getNextQuestion,
  getBasicInfoQuestion,
  getJobSpecificQuestion,
  getDefaultFollowUpQuestion,
  updateUserProfile,
  determineConversationFlow,
  calculateEngagementScore
};