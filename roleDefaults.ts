import { RoleConfig, RoleType, CandidateProfile } from '../types';

export const AVAILABLE_ROLES: RoleType[] = [
  'Java Developer',
  '.NET Developer',
  'DevOps',
  'Production Support',
  'Unix/SQL/Autosys',
  'Cloud',
  'Mainframe Developer/Support',
  'Automation Test Engineer',
  'Kafka STE / L3 Admin',
];

export const AVAILABLE_LOCATIONS: { id: string; label: string }[] = [
  { id: 'India', label: 'India (Bangalore, Hyderabad, Pune, Chennai, NCR)' },
  { id: 'USA', label: 'USA (New York, Dallas, Seattle, SF Bay Area, Chicago)' },
  { id: 'Canada', label: 'Canada (Toronto, Vancouver, Montreal, Ottawa)' },
  { id: 'UK', label: 'UK (London, Manchester, Edinburgh, Birmingham)' },
  { id: 'Remote / Any', label: 'Remote / Any Location' },
];

export const POPULAR_COMPANIES = [
  'Infosys',
  'Wipro',
  'Cognizant',
  'HCLTech',
  'HCL Technologies',
  'Tech Mahindra',
  'LTIMindtree',
  'Mindtree',
  'L&T Infotech',
  'Capgemini',
  'Accenture',
  'Hexaware',
  'Hexaware Technologies',
  'Mphasis',
  'DXC Technology',
  'CGI',
  'NTT DATA',
  'Persistent Systems',
  'Birlasoft',
  'ITC Infotech',
  'Virtusa',
  'Sopra Steria',
  'UST',
  'IBM',
  'UST Global',
  'Zensar Technologies',
];

export const ROLE_CONFIGS: Record<RoleType, RoleConfig> = {
  'Java Developer': {
    role: 'Java Developer',
    title: 'Senior Java Backend / Fullstack Engineer',
    defaultJd:
      'We are looking for an experienced Java Developer responsible for building robust, microservices-based backend architectures. You will develop low-latency high-throughput enterprise RESTful web services, manage distributed transactional systems with Spring Boot, interact with relational and NoSQL databases, and implement clean code practices and unit tests.',
    defaultMustHaveSkills: [
      'Java 17/21',
      'Spring Boot',
      'Microservices Architecture',
      'REST APIs',
      'Hibernate / JPA',
      'SQL / PostgreSQL',
      'JUnit / Mockito',
    ],
    defaultGoodToHaveSkills: [
      'Apache Kafka',
      'Docker & Kubernetes',
      'AWS / GCP Cloud',
      'Redis Caching',
      'GraphQL',
      'CI/CD Pipelines',
      'React / Angular',
    ],
  },
  '.NET Developer': {
    role: '.NET Developer',
    title: 'C# .NET Core Full Stack & Enterprise Engineer',
    defaultJd:
      'Seeking a skilled .NET Developer to design, develop, and maintain secure and scalable distributed cloud applications using .NET 8 / C#, ASP.NET Core Web APIs, Entity Framework Core, and modern asynchronous programming patterns. Experience with SQL Server, Azure services, and modern front-end frameworks is highly desired.',
    defaultMustHaveSkills: [
      'C#',
      '.NET Core / .NET 8',
      'ASP.NET Core Web API',
      'Entity Framework Core',
      'SQL Server / T-SQL',
      'LINQ & Async/Await',
      'Unit Testing (xUnit/NUnit)',
    ],
    defaultGoodToHaveSkills: [
      'Azure App Services & Functions',
      'RabbitMQ / Azure Service Bus',
      'Docker Containers',
      'Microservices',
      'Blazor / React',
      'Redis',
      'Clean Architecture / DDD',
    ],
  },
  DevOps: {
    role: 'DevOps',
    title: 'DevOps & Site Reliability Engineer (SRE)',
    defaultJd:
      'Looking for a DevOps Engineer to automate application deployments, manage containerized infrastructure on Kubernetes, configure Infrastructure as Code (Terraform), and optimize CI/CD pipelines. Must be proficient in monitoring system health, telemetry, observability, and container orchestration across multi-region environments.',
    defaultMustHaveSkills: [
      'Kubernetes (K8s)',
      'Docker & Containerization',
      'CI/CD (Jenkins / GitHub Actions / GitLab)',
      'Terraform (IaC)',
      'Linux Administration & Bash Scripting',
      'AWS or Azure Cloud Platform',
      'Git Version Control',
    ],
    defaultGoodToHaveSkills: [
      'Helm Charts',
      'Prometheus & Grafana',
      'Ansible Configuration Management',
      'ArgoCD / GitOps',
      'Python Automation Scripting',
      'ELK / Datadog Observability',
      'Vault Security Management',
    ],
  },
  'Production Support': {
    role: 'Production Support',
    title: 'L2/L3 Production & Application Support Engineer',
    defaultJd:
      'Responsible for 24/7 mission-critical L2/L3 production application support, incident triage, root cause analysis (RCA), and SLA management. You will monitor server metrics, investigate production bugs, execute emergency hotfixes, handle database updates, and coordinate with engineering and client stakeholders during high-priority incidents.',
    defaultMustHaveSkills: [
      'Incident & Problem Management (ITIL)',
      'Linux / Unix Shell Scripting',
      'SQL Queries & Database Troubleshooting',
      'Log Analysis & Debugging',
      'ServiceNow / Jira Service Management',
      'Monitoring Tools (Splunk / AppDynamics / Dynatrace)',
      'Production Deployment Support',
    ],
    defaultGoodToHaveSkills: [
      'Python / Perl Scripting for Automation',
      'Autosys / Control-M Job Scheduling',
      'Disaster Recovery (DR) Drills',
      'AWS CloudWatch',
      'Message Queues (Kafka / MQ)',
      'Geneva / Financial Domain Knowledge',
    ],
  },
  'Unix/SQL/Autosys': {
    role: 'Unix/SQL/Autosys',
    title: 'Unix, Database & Batch Automation Specialist',
    defaultJd:
      'Seeking a Unix/SQL/Autosys Specialist to engineer, monitor, and troubleshoot high-volume batch processing systems and enterprise ETL jobs. The candidate will write complex Unix shell scripts, optimize analytical SQL queries, configure Autosys JIL job schedules with dependency trees, and handle night-batch SLAs.',
    defaultMustHaveSkills: [
      'Advanced Unix / Linux OS',
      'Shell Scripting (Bash / KornShell)',
      'Autosys (JIL syntax & job scheduling)',
      'Complex SQL & Performance Tuning',
      'Oracle / Sybase / DB2 Databases',
      'Batch Job Dependency Management',
      'Cron / Process Monitoring',
    ],
    defaultGoodToHaveSkills: [
      'Python Scripting',
      'Stored Procedures & PL/SQL',
      'Control-M Job Scheduler',
      'Informatica / ETL Tools',
      'SFTP / Secure File Transfers',
      'Perl',
      'Data Warehousing Concepts',
    ],
  },
  Cloud: {
    role: 'Cloud',
    title: 'Cloud Solutions Architect & Cloud Platform Engineer',
    defaultJd:
      'Looking for a Cloud Specialist (AWS/GCP/Azure) to design, migrate, and build resilient, highly available, and cost-effective cloud architectures. You will architect serverless backends, multi-region networking, IAM policies, auto-scaling groups, cloud security frameworks, and disaster recovery strategies.',
    defaultMustHaveSkills: [
      'AWS / GCP / Azure Architecture',
      'Cloud Networking (VPC, Subnets, Route53, Load Balancers)',
      'IAM & Cloud Security Best Practices',
      'Serverless (Lambda / Cloud Functions)',
      'Infrastructure as Code (Terraform / CloudFormation)',
      'Cloud Storage & Managed Databases',
      'Cost Optimization & FinOps',
    ],
    defaultGoodToHaveSkills: [
      'EKS / GKE / AKS Kubernetes',
      'Multi-Cloud Strategy',
      'CloudWatch / CloudTrail / Stackdriver',
      'API Gateway Management',
      'Python / Boto3 SDK',
      'Certified Solutions Architect',
      'Kafka / PubSub Event Streams',
    ],
  },
  'Mainframe Developer/Support': {
    role: 'Mainframe Developer/Support',
    title: 'Mainframe COBOL, JCL & CICS Developer/Support Engineer',
    defaultJd:
      'Seeking an experienced Mainframe Professional to maintain, enhance, and support enterprise core banking and insurance applications. The candidate must have extensive hands-on experience with COBOL, JCL, DB2, VSAM, and CICS online and batch systems, along with expertise in Abend resolution and debugging using Abend-AID / File-AID / Xpediter.',
    defaultMustHaveSkills: [
      'COBOL Programming',
      'JCL (Job Control Language)',
      'DB2 for z/OS & Embedded SQL',
      'VSAM (KSDS, ESDS, RRDS)',
      'CICS (Customer Information Control System)',
      'Mainframe Debugging (Xpediter / Abend-AID / File-AID)',
      'TSO / ISPF Environment',
    ],
    defaultGoodToHaveSkills: [
      'REXX Scripting',
      'MQ Series',
      'Mainframe Modernization / API Enablement',
      'Endevor / Changeman Version Control',
      'SAS / Assembler',
      'CA7 / Control-M Scheduling',
      'Core Banking Domain Experience',
    ],
  },
  'Automation Test Engineer': {
    role: 'Automation Test Engineer',
    title: 'Senior QA Automation & SDET Engineer',
    defaultJd:
      'Looking for a passionate Automation Test Engineer (SDET) to build scalable automated test frameworks from scratch. You will automate Web UI, API, and cross-browser test suites, integrate test automation into CI/CD pipelines, execute regression cycles, and ensure optimal test coverage and software reliability.',
    defaultMustHaveSkills: [
      'Selenium WebDriver / Playwright / Cypress',
      'Java or Python or JavaScript/TypeScript for Testing',
      'TestNG / JUnit / PyTest Frameworks',
      'REST API Testing (Postman / RestAssured)',
      'BDD / Cucumber / Gherkin',
      'Page Object Model (POM) Design Pattern',
      'Git & CI/CD Pipeline Integration',
    ],
    defaultGoodToHaveSkills: [
      'Performance Testing (JMeter / k6)',
      'Appium Mobile Automation',
      'Docker Test Containers',
      'SQL for Backend Test Verification',
      'Allure / Extent Reporting',
      'Accessibility Testing (WCAG)',
      'Security / OWASP Testing Basics',
    ],
  },
  'Kafka STE / L3 Admin': {
    role: 'Kafka STE / L3 Admin',
    title: 'Kafka STE (Systems Technical Engineer) / L3 Kafka Platform Administrator',
    defaultJd:
      'Looking for a Kafka STE / L3 Kafka Platform Administrator (4 to 15 Years, India). Manage Kafka brokers, cluster nodes, ZooKeeper/KRaft quorums, topic/partition configurations, consumer lag, ACLs/TLS security, and cluster patching/scaling. Linux administration, Shell scripting, and messaging middleware (IBM MQ, RabbitMQ, ActiveMQ). NOTE: Pure Software Developers / Java Backend Engineers who only USE Kafka for writing microservices or building apps are disqualified.',
    defaultMustHaveSkills: [
      'Apache Kafka Administration',
      'Cluster Nodes & Broker Config',
      'ZooKeeper / KRaft Quorums',
      'Partition Rebalancing & Lag Monitoring',
      'ACLs & SSL/TLS Security',
      'Linux Administration & Shell Scripting',
      'Middleware (IBM MQ / RabbitMQ / ActiveMQ)',
    ],
    defaultGoodToHaveSkills: [
      'Confluent Platform',
      'Kafka Connect & MirrorMaker',
      'Prometheus & Grafana Observability',
      'SASL / Kerberos Authentication',
      'Schema Registry & REST Proxy',
      'Cluster Disaster Recovery Drills',
      'Ansible Automation for Kafka',
    ],
  },
};

// Candidate profile pool - starts empty for live sourcing
export const CANDIDATE_POOL: CandidateProfile[] = [];


