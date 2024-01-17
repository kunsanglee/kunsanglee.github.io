---
title: "Effective Java - 아이템 18: 상속보다는 컴포지션을 사용하라"
categories:
  - Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

**메서드 호출과 달리 상속은 캡슐화를 깨뜨린다.**<br>
상위 클래스가 어떻게 구현되느냐에 따라 상속하는 하위 클래스의 동작에 이상이 생길 수 있다.<br>
상위 클래스는 릴리스마다 내부 구현이 달라질 수 있기 때문에, 코드 한 줄 수정하지 않은 하위 클래스에서 오동작 할 수 있다.<br>

### 상속 클래스의 메서드 재정의에서 비롯된 문제
상위 클래스에서 정의한 메서드를 하위 클래스에서 재정의하며 확장하다가 하위 클래스간에 문제가 발생할 경우,<br>
문제를 해결하기 위해 상위 클래스의 메서드를 다시 구현하는 방식은 어렵다.<br>
이런 메서드 재정의에서 비롯된 문제를 해결하기 위해 클래스를 확장하더라도 메서드를 재정의하는 대신,<br>
새로운 메서드를 추가할 경우 계속되는 릴리스에서 새로운 메서드를 추가하다가 하위 클래스에 추가한 메서드와 시그니처가 같고 반환 타입은 다르다면 컴파일조차 되지 않는다. <br>
또는 반환타입마저 같다면 메서드를 재정의한 꼴이 되므로 앞서 메서드 재정의에서 비롯된 문제가 발생할 수 있다.<br>

### 상속의 문제를 해결할 수 있는 컴포지션
이런 문제를 피해갈 수 있는 방법은 기존 클래스를 확장하는 대신, 새로운 클래스를 만들고 private 필드로 기존 클래스의 인스턴스를 참조하는 것이다.<br>

기존 클래스가 새로운 클래스의 구성요소로 쓰인다는 뜻에서 이러한 설계를 **컴포지션(composition; 구성)**이라 한다.<br>
새 클래스의 인스턴스 메서드들은 (private 필드로 참조하는) 기존 클래스의 대응하는 메서드를 호출해 그 결과를 반환한다.<br>
이 방식을 **전달(forwarding)**이라 하며, 새 클래스의 메서드들을 **전달하는 메서드(forwarding method)**라 부른다.<br>
그 결과 새로운 클래스는 기존 클래스의 내부 구현 방식의 영향에서 벗어나며, 심지어 기존 클래스에 새로운 메서드가 추가되더라도 전혀 영향받지 않는다.

```java
// 상속 대신 컴포지션을 사용한 래퍼 클래스
public class InstrumentedSet<E> extends ForwardingSet<E> {
    private int addCount = 0;

    public InstrumentedSet(Set<E> s) {
        super(s);
    }
    
    @Override public boolean add(E e) {
        addCount++;
        return super.add(e);
    }
    
    @Override public boolean addAll(Collection<? extends E> c) {
        addCount += c.size();
        return super.addAll(c);
    }
    
    public int getAddCount() {
        return addCount;
    }
}
```

```java
// 재사용할 수 있는 전달 클래스
public class ForwardingSet<E> implements Set<E> {
    private final Set<E> s;
    public ForwardingSet(Set<E> s) { this.s = s; }
    
    public void clear()                                 { s.clear(); }
    public boolean contains(Object o)                   { return s.contains(o); }
    public boolean isEmpty()                            { return s.isEmpty(); }
    public int size()                                   { return s.size(); }
    public Iterator<E> iterator()                       { return s.iterator(); }
    public boolean add(E e)                             { return s.add(e); }
    public boolean remove(Object o)                     { return s.remove(o); }
    public boolean containsAll(Collection<?> c)         { return s.containsAll(c); }
    public boolean addAll(Collection<? extends  E> c)   { return s.addAll(c); }
    public boolean removeAll(Collection<?> c)           { return s.removeAll(c); }
    public boolean retainAll(Collection<?> c)           { return s.retainAll(c); }
    public Object[] toArray()                           { return s.toArray(); }
    public <T> T[] toArray(T[] a)                       { return s.toArray(a); }
    @Override public boolean equals(Object o)           { return s.equals(o); }
    @Override public int hashCode()                     { return s.hashCode(); }
    @Override public String toString()                  { return s.toString(); }
}
```

InstrumentedSet은 HashSet의 모든 기능을 정의한 Set 인터페이스를 활용해 설계되어 견고하고 아주 유연하다.<br>
Set 인터페이스를 구현했고, Set의 인스턴스를 인수로 받는 생성자를 하나 제공한다.<br> 
**임의의 Set에 계측 기능을 덧씌워 새로운 Set으로 만드는 것이 이 클래스의 핵심이다.**<br>

상속 방식은 구체 클래스 각각 따로 확장해야 하며, 지원하고 싶은 상위 클래스의 생성자 각각에 대응하는 생성자를 별도로 정의해줘야 한다.<br> 
하지만 지금 선보인 컴포지션 방식은 한 번만 구현해두면 어떠한 Set 구현체라도 계측할 수 있으며, 기존 생성자들과도 함께 사용할 수 있다.<br>

### 래퍼(Wrapper)클래스
다른 Set 인스턴스를 감싸고(wrap) 있다는 뜻에서 InstrumentedSet 같은 클래스를 래퍼 클래스라 하며,<br> 
다른 Set에 계측 기능을 덧씌운다는 뜻에서 **데코레이터 패턴(Decorator pattern)**이라고 한다.
컴포지션과 전달의 조합은 넓은 의미로 **위임(delegation)**이라고 부른다.<br> 
래퍼 객체가 내부 객체에 자기 자신의 참조를 넘기는 경우만 위임에 해당한다.<br>

### 래퍼 클래스의 단점
래퍼 클래스는 단점이 거의 없다. 한 가지, 래퍼 클래스가 콜백(call back) 프레임워크와는 어울리지 않는다는 점만 주의하면 된다.
콜백 프레임워크에서는 **자기 자신의 참조를 다른 객체에 넘겨서 다음 호출(콜백) 때 사용**하도록 하는데, 
내부 객체는 자신을 감싸고 있는 래퍼의 존재를 모르니 대신 **자신(this)**의 참조를 넘기고, 콜백 때는 래퍼가 아닌 내부 객체를 호출하게 된다. <br>
이를 **SELF문제**라고 한다.<br>

### 상속
상속은 반드시 하위 클래스가 상위 클래스의 '진짜' 하위 타입인 상황에서만 쓰여야 한다.<br> 
다르게 말하면, 클래스 B가 클래스 A와 is-a 관계일 때만 클래스 A를 상속해야 한다.<br>

**컴포지션을 써야 할 상황에서 상속을 사용하는 건 내부 구현을 불필요하게 노출하는 꼴이다.**<br>
그 결과 API가 내부 구현에 묶이고 그 클래스의 성능도 영원히 제한된다. <br>
더 심각한 문제는 클라이언트가 노출된 내부에 직접 접근할 수 있다는 점이다.<br>
가장 심각한 문제는 클라이언트에서 상위 클래스를 직접 수정하여 **하위 클래스의 불변식을 해칠 수 있다**는 사실이다.
컴포지션으로는 클래스의 결함을 숨기는 새로운 API를 설계할 수 있지만, 상속은 상위 클래스의 API를 '그 결함까지도' 그대로 승계한다.

### 핵심 정리
상속은 강력하지만 캡슐화를 해친다는 문제가 있다.<br> 
**상속은 상위 클래스와 하위 클래스가 순수한 is-a 관계일 때만 써야 한다.**<br>
상속의 취약점을 피하려면 상속 대신 컴포지션과 전달을 사용하자.<br>
래퍼 클래스는 하위 클래스보다 견고하고 강력하다.<br>
