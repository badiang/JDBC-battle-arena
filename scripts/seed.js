require('dotenv').config();
const db = require('../db'); const bcrypt=require('bcryptjs');
const seed = [
 ['JDBC','What does JDBC stand for?','Java Database Connectivity','Java Data Base Compiler','Java Database Controller','Java Data Binding Class','A'],
 ['MySQL','Which SQL command retrieves records?','INSERT','SELECT','UPDATE','DELETE','B'],
 ['JDBC','Which interface represents an active database connection?','ResultSet','SQLException','Connection','JTable','C'],
 ['JDBC','Which interface is used for parameterized SQL?','PreparedStatement','DriverManager','ResultSet','JFrame','A'],
 ['JDBC','Which JDBC method executes INSERT, UPDATE, or DELETE?','executeQuery()','next()','getString()','executeUpdate()','D'],
 ['JDBC','Which JDBC method returns a ResultSet for SELECT?','executeQuery()','executeUpdate()','setString()','close()','A'],
 ['JDBC','Which method advances to the next ResultSet row?','getInt()','next()','addRow()','setString()','B'],
 ['JDBC','Which method sets a String parameter in PreparedStatement?','getString()','executeQuery()','setString()','getConnection()','C'],
 ['JDBC','Which exception commonly handles SQL errors?','IOException','NumberFormatException','NullPointerException','SQLException','D'],
 ['MySQL','Which constraint uniquely identifies each record?','PRIMARY KEY','NOT NULL','DEFAULT','CHECK','A'],
 ['MySQL','Which attribute automatically generates sequential numeric IDs?','VARCHAR','AUTO_INCREMENT','UNIQUE','FOREIGN KEY','B'],
 ['MySQL','Which SQL command changes existing rows?','INSERT','SELECT','UPDATE','CREATE','C'],
 ['MySQL','Which SQL command removes rows?','ALTER','INSERT','SELECT','DELETE','D'],
 ['Swing','Which Swing component displays records in rows and columns?','JTable','JLabel','JButton','JTextField','A'],
 ['Swing','Which JTextField method retrieves user-entered text?','setText()','getText()','addRow()','getConnection()','B'],
 ['Swing','Which DefaultTableModel method adds a table row?','setRowCount()','getValueAt()','addRow()','removeRow()','C'],
 ['OOP','Which OOP principle protects fields through private access?','Inheritance','Polymorphism','Abstraction','Encapsulation','D'],
 ['Design','What does DAO stand for?','Data Access Object','Database Action Operator','Data Array Object','Direct Access Output','A'],
 ['JDBC','Which Java class is commonly used to obtain JDBC connections?','JTable','DriverManager','BufferedReader','DefaultTableModel','B'],
 ['MySQL','What is the usual default port for MySQL?','8080','5432','3306','3000','C']
];
(async()=>{try{
 const id=process.env.ADMIN_ID,password=process.env.ADMIN_PASSWORD;
 if(!id||!password||password.length<10) throw Error('Set ADMIN_ID and ADMIN_PASSWORD (10+ chars) in .env');
 const hash=await bcrypt.hash(password,12);
 await db.execute("INSERT INTO users (student_id,full_name,section,password_hash,role,must_change_password) VALUES (?,?,?,?, 'admin',0) ON DUPLICATE KEY UPDATE id=id",[id,'Instructor','',hash]);
 const [[{n}]]=await db.query('SELECT COUNT(*) n FROM questions');
 if(n===0) for(const row of seed) await db.execute('INSERT INTO questions (topic,question,option_a,option_b,option_c,option_d,correct_answer) VALUES (?,?,?,?,?,?,?)',row);
 console.log('Seed complete. Instructor ID:',id,'Questions:',n===0?seed.length:n);
} catch(e){console.error(e);process.exitCode=1}finally{await db.end()}})();
